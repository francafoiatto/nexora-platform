import type { AuthResponse, LoginInput, RegisterInput, User } from '@nexora/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/query';
import { session, useSession } from '../../lib/session';
import { disconnectSocket } from '../realtime/socket';

export const authApi = {
  login: (input: LoginInput) => apiClient.post<AuthResponse>('/auth/login', input).then((r) => r.data),
  register: (input: RegisterInput) => apiClient.post<AuthResponse>('/auth/register', input).then((r) => r.data),
  me: () => apiClient.get<User>('/auth/me').then((r) => r.data),
};

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (auth) => {
      queryClient.clear();
      session.set(auth);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (auth) => {
      queryClient.clear();
      session.set(auth);
    },
  });
}

/** Re-validates the stored session against the API (a revoked/expired token triggers sign-out). */
export function useMe() {
  const current = useSession();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const user = await authApi.me();
      session.updateUser(user);
      return user;
    },
    enabled: !!current,
    initialData: current?.user,
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return () => {
    disconnectSocket();
    session.clear();
    queryClient.clear();
  };
}
