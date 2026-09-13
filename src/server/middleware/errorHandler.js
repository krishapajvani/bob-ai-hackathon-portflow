/**
 * Global Express error handler.
 *
 * Catches any error passed to next(err) throughout the application.
 * Returns a consistent JSON error shape so the frontend always
 * knows what to expect.
 *
 * Usage: app.use(errorHandler)  — must be registered last.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || err.status || 500;

  // Log the error server-side (skip in test environment to keep output clean)
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${statusCode}] ${err.message}`);
    if (statusCode === 500) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // Include a stack trace only in development — never in production
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
