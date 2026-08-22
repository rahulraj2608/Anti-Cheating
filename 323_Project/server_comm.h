#ifndef SERVER_COMM_H
#define SERVER_COMM_H

#include <windows.h>
#include <stdbool.h>

#define WHITELIST_FILE_PATH "whitelist.txt"

extern HANDLE g_whitelist_semaphore;

bool start_server_comm(const char* student_name, const char* student_id, const char* pc_id);
void stop_server_comm(void);
void set_student_status(const char* status);

#endif // SERVER_COMM_H
