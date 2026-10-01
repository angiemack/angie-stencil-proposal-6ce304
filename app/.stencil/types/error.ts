/**
 * A page failure, already classified by the framework adapter so the error
 * screen needs no router.
 *
 * `status` is present only when the framework raised a route error response
 * (a 404, a thrown `Response`); a thrown `Error` carries `message`/`stack`
 * instead. Both shapes reach the same screen.
 */
export interface PlatformError {
  status?: number;
  statusText?: string;
  message: string;
  stack?: string;
}
