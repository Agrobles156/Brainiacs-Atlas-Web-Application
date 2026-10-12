import { sanitizeInput, validateEmail, validatePassword, escapeHtml } from "../../../lib/security";

export const handleRegisterInputChange = (
  event: React.ChangeEvent<HTMLInputElement>,
  setFormData: React.Dispatch<React.SetStateAction<{ username: string; email: string; emailConfirm: string; password: string; passwordConfirm: string }>>
) => {
  const { name, value } = event.target;
  setFormData((prev) => ({ ...prev, [name]: sanitizeInput(value) }));
};

export const handleRegisterSubmit = async (
  event: React.FormEvent<HTMLFormElement>,
  formData: { username: string; email: string; emailConfirm: string; password: string; passwordConfirm: string },
  router: any,
  setShowAlertError: (v: boolean) => void,
  setShowAlertSuc: (v: boolean) => void,
  setAlertMessage: (v: string | null) => void
) => {
  event.preventDefault();
  setShowAlertError(false);
  setShowAlertSuc(false);
  setAlertMessage(null);

  if (formData.email.trim().toLowerCase() !== formData.emailConfirm.trim().toLowerCase()) {
    setAlertMessage("Emails do not match");
    setShowAlertError(true);
    return;
  }

  if (formData.password !== formData.passwordConfirm) {
    setAlertMessage("Passwords do not match");
    setShowAlertError(true);
    return;
  }

  if (!validateEmail(formData.email)) {
    setAlertMessage("Please enter a valid email address");
    setShowAlertError(true);
    return;
  }

  const passwordValidation = validatePassword(formData.password);
  if (!passwordValidation.isValid) {
    setAlertMessage(passwordValidation.message);
    setShowAlertError(true);
    return;
  }

  if (formData.username.length < 3) {
    setAlertMessage("Username must be at least 3 characters long");
    setShowAlertError(true);
    return;
  }

  const payload = {
    username: formData.username,
    email: formData.email,
    password: formData.password
  };

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/flask-api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      setShowAlertSuc(true);
      setTimeout(() => router.push("/"), 2000);
    } else {
      setAlertMessage(escapeHtml(data.error || "Unknown error"));
      setShowAlertError(true);
    }
  } catch (error) {
    setAlertMessage(error instanceof Error ? escapeHtml(error.message) : "Failed to create account");
    setShowAlertError(true);
  }
};
