#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0600
#endif

#include <winsock2.h>
#include <windows.h>
#include <stdio.h>
#include <string.h>

#include "clipboard_monitor.h"
#include "network_filter.h"
#include "app_monitor.h"
#include "server_comm.h"

// g_network_monitor_running is provided globally by network_filter.h
static bool g_app_monitor_running = true;

DWORD WINAPI app_monitor_thread(LPVOID lpParam) {
    printf("[App Thread] System-wide application monitor ACTIVE.\n\n");

    while (g_app_monitor_running) {
        print_open_applications();
        Sleep(5000);
    }

    return 0;
}

int main(void) {
    char student_name[128];
    char student_id[64];
    char pc_id[64];

    DWORD pc_len = sizeof(pc_id);
    if (!GetComputerNameA(pc_id, &pc_len)) {
        strncpy(pc_id, "PC-01", sizeof(pc_id));
    }

    printf("=== System Monitoring Tools Started ===\n\n");

    printf("Enter Student Name: ");
    if (fgets(student_name, sizeof(student_name), stdin) != NULL) {
        student_name[strcspn(student_name, "\r\n")] = 0;
    }

    printf("Enter Student ID: ");
    if (fgets(student_id, sizeof(student_id), stdin) != NULL) {
        student_id[strcspn(student_id, "\r\n")] = 0;
    }

    printf("\n[Main] Starting modules for %s (%s) on %s...\n\n", student_name, student_id, pc_id);

    // 1. Start Clipboard Monitor
    start_clipboard_monitor(150, true);

    // 2. Start Server Sync Thread
    if (!start_server_comm(student_name, student_id, pc_id)) {
        printf("[Main Warning] Failed to start server communication module.\n");
    }

    // 3. Start Network & App Threads
    HANDLE hNetThread = CreateThread(NULL, 0, network_monitor_thread, NULL, 0, NULL);
    HANDLE hAppThread = CreateThread(NULL, 0, app_monitor_thread, NULL, 0, NULL);

    // Keep program active
    Sleep(200000);

    // Signal loops to terminate
    g_network_monitor_running = false;
    g_app_monitor_running = false;

    // Wait & Clean up threads
    if (hNetThread != NULL) {
        WaitForSingleObject(hNetThread, INFINITE);
        CloseHandle(hNetThread);
    }

    if (hAppThread != NULL) {
        WaitForSingleObject(hAppThread, INFINITE);
        CloseHandle(hAppThread);
    }

    // Shut down server sync and clipboard monitor threads
    stop_server_comm();
    stop_clipboard_monitor();

    printf("\n[Main] All background monitors stopped successfully.\n");
    return 0;
}
