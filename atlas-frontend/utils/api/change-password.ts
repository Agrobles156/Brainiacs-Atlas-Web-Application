// utils/api/change-password.ts
export async function changePassword({
  currentPassword,
  newPassword
}: {
  currentPassword: string,
  newPassword: string;
}) {
  const response = await fetch("/flask-api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // important for session cookies
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to change password");
  }

  return data;
}
