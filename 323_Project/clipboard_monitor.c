#include "clipboard_monitor.h"
#include "server_comm.h"
#include <windows.h>
#include <stdio.h>

static HANDLE g_hThread = NULL;
static bool g_running = false;
static size_t g_limit = 0;
static bool g_blocking_enabled = false;

static DWORD WINAPI clipboard_thread_func(LPVOID lpParam) {
    while (g_running) {
        if (g_blocking_enabled && OpenClipboard(NULL)) {
            HANDLE hData = GetClipboardData(CF_TEXT);

            if (hData != NULL) {
                char *pszText = (char*)GlobalLock(hData);
                if (pszText != NULL) {
                    size_t text_length = strlen(pszText);
                    GlobalUnlock(hData);

                    // Block copy by wiping clipboard if length exceeds parameter limit
                    if (text_length > g_limit) {
                        EmptyClipboard();
                        printf("\n[Monitor] Blocked clipboard copy! Length (%lu) exceeded limit (%lu).\n",
                               (unsigned long)text_length, (unsigned long)g_limit);

                        // Trigger status change on the dashboard
                        set_student_status("Flagged");
                    }
                }
            }
            CloseClipboard();
        }
        Sleep(200); // Poll clipboard every 200 ms
    }
    return 0;
}

void start_clipboard_monitor(size_t limit, bool enable_blocking) {
    g_limit = limit;
    g_blocking_enabled = enable_blocking;
    g_running = true;

    // Spawns monitoring in a separate thread
    g_hThread = CreateThread(NULL, 0, clipboard_thread_func, NULL, 0, NULL);
}

void update_clipboard_limit(size_t new_limit) {
    g_limit = new_limit;
    printf("[Clipboard Monitor] Character limit updated to: %Iu\n", new_limit);
}

void stop_clipboard_monitor(void) {
    g_running = false;
    if (g_hThread) {
        WaitForSingleObject(g_hThread, INFINITE);
        CloseHandle(g_hThread);
        g_hThread = NULL;
    }
}
