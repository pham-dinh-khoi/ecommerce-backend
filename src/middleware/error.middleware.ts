// import type { Request, Response, NextFunction } from 'express';

// /**
//  * Global Error Handling Middleware
//  * Intercepts all errors thrown in the application and formats the JSON response.
//  * Express recognizes this as an error-handling middleware because it has 4 parameters.
//  */
// export const globalErrorHandler = (
//   err: any,
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   // Set default error status and status code if not provided
//   err.statusCode = err.statusCode || 500;
//   err.status = err.status || 'error';
//   err.message = err.message || 'This error originates from the server system.';

//   // Environment-specific response logic
//   if (process.env.NODE_ENV === 'development') {
//     // Development mode: Detailed response including stack trace for debugging
//     res.status(err.statusCode).json({
//       success: false,
//       status: err.status,
//       message: err.message,
//       stack: err.stack,
//       error: err,
//     });
//   } else {
//     // Production mode: Sanitized response (hiding implementation details/stack trace)
//     res.status(err.statusCode).json({
//       success: false,
//       status: err.status,
//       message: err.message,
//     });
//   }
// };