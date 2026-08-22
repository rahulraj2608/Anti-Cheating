#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0600
#endif

// Winsock2 MUST be included BEFORE windows.h
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "network_filter.h"
#include "server_comm.h"

#ifndef ERROR_INSUFFICIENT_BUFFER
#define ERROR_INSUFFICIENT_BUFFER 122L
#endif

#ifndef NO_ERROR
#define NO_ERROR 0L
#endif

#define MAX_WHITELIST 50
#define MAX_HOST_LEN 256
#define MAX_SEEN 500

typedef struct {
    char hostname[MAX_HOST_LEN];
    unsigned long ip_addr;
} WhitelistItem;

typedef struct {
    unsigned long remoteIP;
    unsigned short remotePort;
} SeenConn;

// Control flag for network thread execution loop
bool g_network_monitor_running = true;

static WhitelistItem g_whitelist[MAX_WHITELIST];
static int g_whitelist_count = 0;

static SeenConn g_seen[MAX_SEEN];
static int g_seen_count = 0;

bool init_network_filter(void) {
    WSADATA wsa;
    return (WSAStartup(MAKEWORD(2, 2), &wsa) == 0);
}

void clear_whitelist(void) {
    g_whitelist_count = 0;
}

bool add_to_whitelist(const char *hostname) {
    if (g_whitelist_count >= MAX_WHITELIST || strlen(hostname) >= MAX_HOST_LEN) {
        return false;
    }

    struct hostent *he = gethostbyname(hostname);
    if (he == NULL) {
        printf("[Filter Setup] Failed to resolve IP for whitelist domain: %s\n", hostname);
        return false;
    }

    strncpy(g_whitelist[g_whitelist_count].hostname, hostname, MAX_HOST_LEN - 1);
    g_whitelist[g_whitelist_count].ip_addr = ((struct in_addr *)he->h_addr_list[0])->s_addr;

    struct in_addr addr;
    addr.s_addr = g_whitelist[g_whitelist_count].ip_addr;
    printf("[Filter Setup] Whitelisted: %s (%s)\n", hostname, inet_ntoa(addr));

    g_whitelist_count++;
    return true;
}

static bool is_ip_whitelisted(unsigned long ip) {
    for (int i = 0; i < g_whitelist_count; i++) {
        if (g_whitelist[i].ip_addr == ip) {
            return true;
        }
    }
    return false;
}

static bool is_already_seen(unsigned long ip, unsigned short port) {
    for (int i = 0; i < g_seen_count; i++) {
        if (g_seen[i].remoteIP == ip && g_seen[i].remotePort == port) {
            return true;
        }
    }
    return false;
}

static void mark_seen(unsigned long ip, unsigned short port) {
    if (g_seen_count < MAX_SEEN) {
        g_seen[g_seen_count].remoteIP = ip;
        g_seen[g_seen_count].remotePort = port;
        g_seen_count++;
    } else {
        g_seen_count = 0;
    }
}

// Thread-safe whitelist reader using semaphore locking
static void load_whitelist_from_file(void) {
    if (g_whitelist_semaphore == NULL) return;

    WaitForSingleObject(g_whitelist_semaphore, INFINITE);

    FILE *file = fopen(WHITELIST_FILE_PATH, "r");
    if (file) {
        clear_whitelist();
        char domain[MAX_HOST_LEN];
        while (fgets(domain, sizeof(domain), file)) {
            domain[strcspn(domain, "\r\n")] = 0; // Strip newlines
            if (strlen(domain) > 0) {
                add_to_whitelist(domain);
            }
        }
        fclose(file);
    }

    ReleaseSemaphore(g_whitelist_semaphore, 1, NULL);
}

void scan_system_connections(void) {
    load_whitelist_from_file();

    PMIB_TCPTABLE pTcpTable = NULL;
    DWORD dwSize = 0;

    if (GetTcpTable(NULL, &dwSize, FALSE) == ERROR_INSUFFICIENT_BUFFER) {
        pTcpTable = (PMIB_TCPTABLE)malloc(dwSize);
    }

    if (pTcpTable != NULL && GetTcpTable(pTcpTable, &dwSize, FALSE) == NO_ERROR) {
        for (DWORD i = 0; i < pTcpTable->dwNumEntries; i++) {
            MIB_TCPROW row = pTcpTable->table[i];

            if (row.dwState == MIB_TCP_STATE_ESTAB || row.dwState == MIB_TCP_STATE_SYN_SENT) {
                unsigned long remoteIP = row.dwRemoteAddr;
                unsigned short remotePort = ntohs((unsigned short)row.dwRemotePort);

                if (remoteIP == 0 || remoteIP == 0x0100007f) continue;

                if (!is_ip_whitelisted(remoteIP) && !is_already_seen(remoteIP, remotePort)) {
                    mark_seen(remoteIP, remotePort);

                    struct in_addr addr;
                    addr.s_addr = remoteIP;
                    printf("[WARNING] Non-Whitelisted Outbound Connection Detected!\n");
                    printf("          Target IP: %s:%u\n\n", inet_ntoa(addr), remotePort);
                }
            }
        }
    }

    if (pTcpTable != NULL) {
        free(pTcpTable);
    }
}

// Network Monitoring Worker Thread for main.c
DWORD WINAPI network_monitor_thread(LPVOID lpParam) {
    if (!init_network_filter()) {
        printf("[Network Thread] Failed to initialize network monitoring.\n");
        return 1;
    }

    printf("[Network Thread] System-wide network monitor ACTIVE.\n\n");

    while (g_network_monitor_running) {
        scan_system_connections();
        Sleep(2000);
    }

    cleanup_network_filter();
    return 0;
}

void cleanup_network_filter(void) {
    WSACleanup();
}
