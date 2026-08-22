#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0600
#endif

#include "server_comm.h"
#include "clipboard_monitor.h"
#include "app_monitor.h"
#include <winsock2.h>
#include <wininet.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define SERVER_HOST "127.0.0.1"
#define SERVER_PORT 5000

HANDLE g_whitelist_semaphore = NULL;

static HANDLE h_server_thread = NULL;
static bool g_server_comm_running = false;

static char g_student_name[128] = {0};
static char g_student_id[64] = {0};
static char g_pc_id[64] = {0};
static char g_student_status[64] = "Allowed";
static bool g_clipboard_flagged = false;

void set_student_status(const char* status) {
    if (status && strlen(status) > 0) {
        strncpy(g_student_status, status, sizeof(g_student_status) - 1);
        g_student_status[sizeof(g_student_status) - 1] = '\0';
        if (strcmp(status, "Flagged") == 0) {
            g_clipboard_flagged = true; // Retain clipboard violation
        }
    }
}

static void sanitize_json_string(char *str) {
    for (int i = 0; str[i] != '\0'; i++) {
        if (str[i] == '\\') {
            str[i] = '/';
        } else if (str[i] == '"' || str[i] == '\r' || str[i] == '\n') {
            str[i] = '\'';
        }
    }
}

// Case-insensitive substring search helper
static char* stristr(const char* haystack, const char* needle) {
    if (!haystack || !needle) return NULL;
    if (!*needle) return (char*)haystack;

    for (; *haystack; haystack++) {
        if (tolower((unsigned char)*haystack) == tolower((unsigned char)*needle)) {
            const char *h = haystack + 1, *n = needle + 1;
            while (*h && *n && tolower((unsigned char)*h) == tolower((unsigned char)*n)) {
                h++;
                n++;
            }
            if (!*n) return (char*)haystack;
        }
    }
    return NULL;
}

// Evaluates active app title against whitelist rules
static void evaluate_app_status(const char* active_app) {
    // 1. If flagged by clipboard violation, retain Flagged status
    if (g_clipboard_flagged) {
        strcpy(g_student_status, "Flagged");
        return;
    }

    // 2. Allowed IDEs, dev tools, and system applications
    const char* allowed_dev_tools[] = {
        "VS Code", "Visual Studio", "Code::Blocks", "CLion", "Dev-Cpp",
        "Command Prompt", "PowerShell", "Terminal", "Desktop / System",
        "323_Project.exe", NULL
    };

    for (int i = 0; allowed_dev_tools[i] != NULL; i++) {
        if (stristr(active_app, allowed_dev_tools[i]) != NULL) {
            strcpy(g_student_status, "Allowed");
            return;
        }
    }

    // 3. Web Browser Check: Verify browser window title contains a whitelisted domain
    const char* web_browsers[] = { "Chrome", "Edge", "Firefox", "Brave", "Opera", NULL };
    bool is_browser = false;

    for (int i = 0; web_browsers[i] != NULL; i++) {
        if (stristr(active_app, web_browsers[i]) != NULL) {
            is_browser = true;
            break;
        }
    }

    if (is_browser) {
        bool domain_matched = false;

        // Check window title against whitelist domains in whitelist.txt
        if (g_whitelist_semaphore != NULL) {
            WaitForSingleObject(g_whitelist_semaphore, INFINITE);
            FILE* file = fopen(WHITELIST_FILE_PATH, "r");
            if (file) {
                char domain[128];
                while (fgets(domain, sizeof(domain), file)) {
                    domain[strcspn(domain, "\r\n")] = 0;
                    if (strlen(domain) > 0 && stristr(active_app, domain) != NULL) {
                        domain_matched = true;
                        break;
                    }
                }
                fclose(file);
            }
            ReleaseSemaphore(g_whitelist_semaphore, 1, NULL);
        }

        if (domain_matched) {
            strcpy(g_student_status, "Allowed");
        } else {
            strcpy(g_student_status, "Flagged"); // Non-whitelisted site
        }
        return;
    }

    // 4. Any other non-approved application (e.g. Spotify, Discord, Games)
    strcpy(g_student_status, "Flagged");
}

static bool http_get(const char* path, char* buffer, DWORD buffer_size) {
    HINTERNET hSession = InternetOpenA("LabGuardAgent", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hSession) return false;

    DWORD timeout = 2000;
    InternetSetOptionA(hSession, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout, sizeof(timeout));
    InternetSetOptionA(hSession, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeout, sizeof(timeout));

    HINTERNET hConnect = InternetConnectA(hSession, SERVER_HOST, SERVER_PORT, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
    if (!hConnect) {
        InternetCloseHandle(hSession);
        return false;
    }

    HINTERNET hRequest = HttpOpenRequestA(hConnect, "GET", path, NULL, NULL, NULL, 0, 0);
    if (!hRequest) {
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hSession);
        return false;
    }

    bool success = HttpSendRequestA(hRequest, NULL, 0, NULL, 0);
    if (success) {
        DWORD bytesRead = 0;
        InternetReadFile(hRequest, buffer, buffer_size - 1, &bytesRead);
        buffer[bytesRead] = '\0';
    }

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hSession);
    return success;
}

static bool http_post_json(const char* path, const char* json_data) {
    HINTERNET hSession = InternetOpenA("LabGuardAgent", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hSession) return false;

    DWORD timeout = 2000;
    InternetSetOptionA(hSession, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout, sizeof(timeout));
    InternetSetOptionA(hSession, INTERNET_OPTION_SEND_TIMEOUT, &timeout, sizeof(timeout));

    HINTERNET hConnect = InternetConnectA(hSession, SERVER_HOST, SERVER_PORT, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
    if (!hConnect) {
        InternetCloseHandle(hSession);
        return false;
    }

    HINTERNET hRequest = HttpOpenRequestA(hConnect, "POST", path, NULL, NULL, NULL, 0, 0);
    if (!hRequest) {
        InternetCloseHandle(hConnect);
        InternetCloseHandle(hSession);
        return false;
    }

    const char* headers = "Content-Type: application/json";
    bool success = HttpSendRequestA(hRequest, headers, (DWORD)strlen(headers), (LPVOID)json_data, (DWORD)strlen(json_data));

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hSession);
    return success;
}

static DWORD WINAPI server_comm_thread(LPVOID lpParam) {
    char response[2048];
    char payload[512];
    char active_app[256];

    printf("[Server Thread] Telemetry sync loop started.\n");

    while (g_server_comm_running) {
        // 1. Fetch updated config from Express server
        if (http_get("/api/agent/config", response, sizeof(response))) {
            char* limit_ptr = strstr(response, "\"copyLimit\":");
            if (limit_ptr) {
                size_t new_limit = (size_t)atoi(limit_ptr + 12);
                update_clipboard_limit(new_limit);
            }

            char* list_start = strstr(response, "\"whitelist\":[");
            if (list_start && g_whitelist_semaphore != NULL) {
                WaitForSingleObject(g_whitelist_semaphore, INFINITE);

                FILE* file = fopen(WHITELIST_FILE_PATH, "w");
                if (file) {
                    char* next_token = NULL;
                    char* token = strtok_s(list_start, "\",]", &next_token);
                    while (token != NULL) {
                        if (strstr(token, ".") && !strstr(token, "whitelist")) {
                            fprintf(file, "%s\n", token);
                        }
                        token = strtok_s(NULL, "\",]", &next_token);
                    }
                    fclose(file);
                }

                ReleaseSemaphore(g_whitelist_semaphore, 1, NULL);
            }
        }

        // 2. Query foreground app
        get_active_app_name(active_app, sizeof(active_app));

        // 3. Evaluate whitelist/app status dynamically
        evaluate_app_status(active_app);

        // 4. Sanitize JSON string characters
        sanitize_json_string(active_app);

        // 5. Post telemetry update
        snprintf(payload, sizeof(payload),
            "{\"pcId\":\"%s\",\"studentId\":\"%s\",\"name\":\"%s\",\"activeApp\":\"%s\",\"status\":\"%s\"}",
            g_pc_id, g_student_id, g_student_name, active_app, g_student_status);

        http_post_json("/api/students/ping", payload);

        Sleep(5000);
    }
    return 0;
}

bool start_server_comm(const char* student_name, const char* student_id, const char* pc_id) {
    strncpy(g_student_name, student_name, sizeof(g_student_name) - 1);
    strncpy(g_student_id, student_id, sizeof(g_student_id) - 1);
    strncpy(g_pc_id, pc_id, sizeof(g_pc_id) - 1);

    if (g_whitelist_semaphore == NULL) {
        g_whitelist_semaphore = CreateSemaphore(NULL, 1, 1, NULL);
        if (g_whitelist_semaphore == NULL) return false;
    }

    g_server_comm_running = true;
    h_server_thread = CreateThread(NULL, 0, server_comm_thread, NULL, 0, NULL);
    return (h_server_thread != NULL);
}

void stop_server_comm(void) {
    g_server_comm_running = false;
    if (h_server_thread != NULL) {
        WaitForSingleObject(h_server_thread, INFINITE);
        CloseHandle(h_server_thread);
        h_server_thread = NULL;
    }
    if (g_whitelist_semaphore != NULL) {
        CloseHandle(g_whitelist_semaphore);
        g_whitelist_semaphore = NULL;
    }
}
