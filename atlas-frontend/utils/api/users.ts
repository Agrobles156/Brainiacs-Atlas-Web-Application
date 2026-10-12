export async function fetchUserData() {
  const baseUrl = 'flask-api';

  const res = await fetch(`${baseUrl}/whoami`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error('Not authenticated');
  }

  const data = await res.json();
  return data;
}
