import { Radio } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ApiError } from "@/lib/api";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  submitting?: boolean;
}

export function LoginPage({ onLogin, submitting = false }: LoginPageProps) {
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
    <main className="flex min-h-screen bg-background text-foreground">
      <section className="flex flex-1 items-center justify-center bg-muted/30 px-6 py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Radio className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold">登录 GeWeHub</h1>
              <p className="mt-1 text-sm text-muted-foreground">使用本地管理员账号进入控制台</p>
            </div>
          </div>

          <label className="block text-sm font-medium" htmlFor="admin-username">
            账号
          </label>
          <input
            id="admin-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          <label className="mt-4 block text-sm font-medium" htmlFor="admin-password">
            密码
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          {error ? (
            <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "登录中" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}
