import axios, { AxiosError } from 'axios';
import { parseCookies, setCookie } from 'nookies';
import { signOut } from '../contexts/AuthContext';

let cookies = parseCookies();
let isRefreshing = false;
let failedRequestsQueue = [];

export const api = axios.create({
  baseURL: 'http://localhost:3333',
  headers: {
    Authorization: `Bearer ${cookies['nextauth.token']}`
  }
});

api.interceptors.request.use();

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    console.log(error.response.status, error.message);
    if (error.response.status === 401) {
      if (error.response.data?.code === 'token.expired') {
        const { 'nextauth.refreshToken': refreshToken } = parseCookies();
        const originalConfig = error.config;

        if (!isRefreshing) {
          isRefreshing = true;

          api.post('/refresh', { refreshToken })
            .then((response) => {
              setCookie(undefined, 'nextauth.token', response.data.token, {
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
                sameSite: true,
              });
              setCookie(undefined, 'nextauth.refreshToken', response.data.refreshToken, {
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
                sameSite: true,
              });

              api.defaults.headers['Authorization'] = `Bearer ${response.data.token}`;

              failedRequestsQueue.forEach((req) => req.resolve(response.data.token));
            })
            .catch((error) => {
              failedRequestsQueue.forEach((req) => req.reject(error));
            })
            .finally(() => {
              isRefreshing = false;
              failedRequestsQueue = [];
            });
        }

        return new Promise((resolve, reject) => {
          failedRequestsQueue.push({
            resolve: (token: string) => {
              originalConfig.headers['Authorization'] = `Bearer ${token}`;
              resolve(api(originalConfig));
            },
            reject: (err: AxiosError) => {
              reject(err);
            },
          });
        });
      } else {
        signOut();
      }
    }

    return Promise.reject(error);
  }
);
