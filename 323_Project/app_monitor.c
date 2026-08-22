#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0600
#endif

#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <psapi.h>
#include "app_monitor.h"

// Callback procedure executed for every top-level OS window
static BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    // 1. Skip invisible windows
    if (!IsWindowVisible(hwnd)) {
        return TRUE;
    }

    // 2. Skip child/utility popups (filters down to main application windows)
    if (GetWindow(hwnd, GW_OWNER) != NULL) {
        return TRUE;
    }

    // 3. Skip windows without titles
    int length = GetWindowTextLength(hwnd);
    if (length == 0) {
        return TRUE;
    }

    char title[256];
    GetWindowText(hwnd, title, sizeof(title));

    // 4. Retrieve Process ID (PID) owning the window
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);

    // 5. Query OS process handle to resolve executable file name
    char process_name[MAX_PATH] = "Unknown";
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (hProcess != NULL) {
        GetModuleBaseName(hProcess, NULL, process_name, sizeof(process_name));
        CloseHandle(hProcess);
    }

    printf("  [PID: %5lu] Process: %-20s | Window Title: %s\n",
           (unsigned long)pid, process_name, title);

    return TRUE;
}

// Retrieves the title & process name of the application currently in foreground/focused
void get_active_app_name(char *out_name, size_t max_len) {
    HWND hwnd = GetForegroundWindow();
    if (hwnd == NULL) {
        strncpy(out_name, "Desktop / System", max_len - 1);
        out_name[max_len - 1] = '\0';
        return;
    }

    char window_title[256] = "";
    char process_name[MAX_PATH] = "";

    GetWindowText(hwnd, window_title, sizeof(window_title));

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (hProcess != NULL) {
        GetModuleBaseName(hProcess, NULL, process_name, sizeof(process_name));
        CloseHandle(hProcess);
    }

    if (strlen(window_title) > 0) {
        strncpy(out_name, window_title, max_len - 1);
    } else if (strlen(process_name) > 0) {
        strncpy(out_name, process_name, max_len - 1);
    } else {
        strncpy(out_name, "Desktop / System", max_len - 1);
    }

    out_name[max_len - 1] = '\0';
}

void print_open_applications(void) {
    printf("=== Currently Active Open Applications ===\n");
    EnumWindows(EnumWindowsProc, 0);
    printf("==========================================\n\n");
}
