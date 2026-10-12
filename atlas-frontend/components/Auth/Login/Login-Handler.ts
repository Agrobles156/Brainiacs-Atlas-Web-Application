import { sanitizeInput, validateEmail, escapeHtml } from "../../../lib/security";

export const initializeLogin = (
  searchParams: URLSearchParams,
  router: any,
  setShowAlertError: (v: boolean) => void,
  setShowAlertSuc: (v: boolean) => void,
  setAlertMessage: (v: string | null) => void
) => {
  const loginStatus = searchParams.get("login");
  const orcidVerify = searchParams.get("orcid_verify_email");
  const orcidId = searchParams.get("orcid_id");

  if (loginStatus === "success") {
    setShowAlertSuc(true);
    setAlertMessage("Login successful! Redirecting...");
    setTimeout(() => router.push("/"), 1500);
  }

  if (orcidVerify === "true") {
    setShowAlertError(true);
    setAlertMessage(
      `Your ORCID email is private. Please enter your account email to continue.`
    );
  }

  if (orcidId && !orcidVerify) {
    // Future: allow direct linking notice
  }
};

export const handleInputChange = (
  event: React.ChangeEvent<HTMLInputElement>,
  setFormData: React.Dispatch<
    React.SetStateAction<{ email: string; password: string }>
  >
) => {
  const { name, value } = event.target;
  setFormData((prev) => ({
    ...prev,
    [name]: sanitizeInput(value)
  }));
};

export const handleLoginSubmit = async (
  event: React.FormEvent<HTMLFormElement>,
  formData: { email: string; password: string },
  router: any,
  setShowAlertError: (v: boolean) => void,
  setShowAlertSuc: (v: boolean) => void,
  setAlertMessage: (v: string | null) => void
) => {
  event.preventDefault();
  setShowAlertError(false);
  setShowAlertSuc(false);
  setAlertMessage(null);

  if (!validateEmail(formData.email)) {
    setShowAlertError(true);
    setAlertMessage("Please enter a valid email address");
    return;
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/flask-api/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData)
      }
    );

    const data = await response.json();

    if (response.ok) {
      setShowAlertSuc(true);
      setAlertMessage("Login successful. Redirecting...");
      setTimeout(() => router.push("/"), 1500);
    } else {
      setShowAlertError(true);
      setAlertMessage(escapeHtml(data.error || "Unknown error"));
    }
  } catch (error) {
    setShowAlertError(true);
    setAlertMessage(
      error instanceof Error
        ? escapeHtml(error.message)
        : "Failed to contact backend"
    );
  }
};

export const handleOrcidVerifyEmail = async (
  email: string,
  router: any,
  setShowAlertError: (v: boolean) => void,
  setShowAlertSuc: (v: boolean) => void,
  setAlertMessage: (v: string | null) => void
) => {
  setShowAlertError(false);
  setShowAlertSuc(false);

  if (!validateEmail(email)) {
    setShowAlertError(true);
    setAlertMessage("Please enter a valid email.");
    return;
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL || ""}/flask-api/auth/orcid/verify-email`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      }
    );

    const data = await response.json();

    if (response.ok) {
      setShowAlertSuc(true);
      setAlertMessage("ORCID linked! Redirecting...");
      setTimeout(() => router.push(data.redirect_path || "/"), 1500);
    } else {
      setShowAlertError(true);
      setAlertMessage(data.error || "Failed to verify ORCID email");
    }
  } catch (err) {
    setShowAlertError(true);
    setAlertMessage("Network error verifying ORCID email");
  }
};


export const handleOAuthLogin = (provider: "google" | "orcid") => {
  const base = "/flask-api/auth";
  window.location.href = `${base}/${provider}`;
};
