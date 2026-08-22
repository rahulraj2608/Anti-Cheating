#ifndef APP_MONITOR_H
#define APP_MONITOR_H

#include <stdbool.h>
#include <stddef.h>

void print_open_applications(void);
void get_active_app_name(char *out_name, size_t max_len);

#endif // APP_MONITOR_H
