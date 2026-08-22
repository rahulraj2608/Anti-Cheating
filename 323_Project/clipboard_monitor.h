#ifndef CLIPBOARD_MONITOR_H
#define CLIPBOARD_MONITOR_H

#include <stdbool.h>
#include <stddef.h>

void start_clipboard_monitor(size_t limit, bool enable_blocking);
void update_clipboard_limit(size_t new_limit);
void stop_clipboard_monitor(void);

#endif // CLIPBOARD_MONITOR_H
