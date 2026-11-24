/**
 * Secure API Client for SecureVault
 *
 * Requirements:
 * - Uses HttpOnly cookies exclusively (credentials: 'include').
 * - Tokens are NEVER stored in localStorage or exposed to JavaScript.
 * - Deduplicates concurrent refresh calls using a shared in-flight promise to avoid token rotation conflicts.
 * - Automatically performs a transparent retry if an access token has expired.
 */

let activeRefreshPromise = null;

/**
 * Silently refreshes the user's session using the HttpOnly refresh token cookie.
 * Multiple simultaneous calls share a single in-flight promise to prevent
 * refresh token rotation race conditions.
 *
 * @returns {Promise<Object|null>} Refreshed user object or null if session is invalid.
 */
export const refreshSession = async () => {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return data.user || null;
    } catch (_err) {
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
};

/**
 * Authenticated fetch wrapper that automatically:
 * 1. Enforces credentials: "include" for HttpOnly cookies.
 * 2. Catches 401 Unauthorized responses.
 * 3. Attempts a single silent token refresh.
 * 4. Retries the original request once with fresh cookies.
 *
 * @param {string} url - API endpoint URL.
 * @param {RequestInit} [options={}] - Fetch configuration options.
 * @returns {Promise<Response>}
 */
export const secureFetch = async (url, options = {}) => {
  const fetchOptions = {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
    },
  };

  let response = await fetch(url, fetchOptions);

  // If unauthorized and this is not an authentication endpoint itself, attempt silent refresh
  if (response.status === 401 && !url.includes("/api/auth/")) {
    const refreshedUser = await refreshSession();

    if (refreshedUser) {
      // Retry the original request once with newly rotated HttpOnly cookie
      response = await fetch(url, fetchOptions);
    }
  }

  return response;
};
