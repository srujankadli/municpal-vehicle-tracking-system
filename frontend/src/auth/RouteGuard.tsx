import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from './AuthContext';

export interface RouteGuardProps {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
}

export const RouteGuard: React.FC<RouteGuardProps> = ({ allowedRoles, children }) => {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
};
