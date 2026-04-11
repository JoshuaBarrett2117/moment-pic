const form = document.querySelector("#login-form");
const statusNode = document.querySelector("#login-status");

const setStatus = (message) => {
  if (statusNode) {
    statusNode.textContent = message;
  }
};

if (form instanceof HTMLFormElement) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!username || !password) {
      setStatus("请输入完整账号和密码");
      return;
    }

    setStatus("登录中...");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "登录失败");
      }

      setStatus("登录成功，正在跳转...");
      window.location.href = "/index.html";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "登录失败");
    }
  });
}
