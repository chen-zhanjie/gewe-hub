import { Radio } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";

export function MobileLoginPage({ onLogin, submitting = false }: { onLogin: (username: string, password: string) => Promise<void>; submitting?: boolean }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await onLogin(username, password);
    } catch (loginError) {
      setError(loginError instanceof ApiError ? loginError.message : "登录失败");
    }
  }

  return (
    <main className="mobile-login-page">
      <form onSubmit={handleSubmit} className="w-full max-w-sm px-8">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Radio className="size-7" />
          </span>
          <h1 className="text-xl font-semibold">登录 GeWeHub</h1>
          <p className="mt-2 text-sm text-muted-foreground">个微消息与智能会话中台</p>
        </div>
        <label htmlFor="mobile-admin-username" className="text-sm font-medium">账号</label>
        <input id="mobile-admin-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mobile-form-input mt-2" />
        <label htmlFor="mobile-admin-password" className="mt-4 block text-sm font-medium">密码</label>
        <input id="mobile-admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mobile-form-input mt-2" />
        {error ? <div role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <button type="submit" disabled={submitting} className="mt-6 min-h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {submitting ? "登录中" : "登录"}
        </button>
      </form>
    </main>
  );
}
