const event = {
  data: {
    type: 'GOOGLE_AUTH_ERROR',
    error: {"error":"oauth_token_exchange_failed","category":"oauth","requestId":"k42a1r1l8b","message":"OAuth token exchange failed. Check server logs with requestId."}
  }
};
let errorMessage = "Authentication failed on server.";
if (event.data.error) {
    if (typeof event.data.error === 'string') {
        errorMessage = event.data.error;
    } else if (event.data.error.message) {
        errorMessage = event.data.error.message;
        if (event.data.error.requestId) {
        errorMessage += ` (Request ID: ${event.data.error.requestId})`;
        }
    } else {
        try {
        errorMessage = JSON.stringify(event.data.error);
        } catch (e) {}
    }
}
console.log(errorMessage);
