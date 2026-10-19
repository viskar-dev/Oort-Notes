import { useNavigate, useRouteError } from 'react-router-dom';
import { RouteError } from '@/pages/route-error';

/// Route-level boundary (react-router `errorElement`): renders data errors,
/// render crashes and failed lazy chunks as the friendly full-page error,
/// instead of a blank screen.
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const message =
    error instanceof Error
      ? error.message
      : 'The page failed to load. Please try again.';

  return (
    <RouteError
      title="Something went wrong"
      message={message}
      onBack={() => navigate('/')}
      backLabel="Back to notebooks"
    />
  );
}
