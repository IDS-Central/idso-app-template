// LOADING STATE: Reusable loading indicator for pages and sections.
//
// Usage:
//   <LoadingState />                          // Default spinner
//   <LoadingState message="Loading tasks..." /> // With message

'use client';

interface LoadingStateProps {
  /** Optional message to display below the spinner */
  message?: string;
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
      <p className="mt-3 text-sm text-gray-500">{message}</p>
    </div>
  );
}
