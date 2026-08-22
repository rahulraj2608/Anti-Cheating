#ifndef NETWORK_FILTER_H
#define NETWORK_FILTER_H

#include <windows.h>
#include <stdbool.h>

// Global control flag for thread loop
extern bool g_network_monitor_running;

bool init_network_filter(void);
void clear_whitelist(void);
bool add_to_whitelist(const char *hostname);
void scan_system_connections(void);
void cleanup_network_filter(void);

// Thread prototype declaration for main.c
DWORD WINAPI network_monitor_thread(LPVOID lpParam);

#endif
