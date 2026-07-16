import Link from "next/link";
import { logoutAction } from "./actions";

export default function AppHeader({ displayName }: { displayName: string }) {
  return (
    <header className="topbar">
      <div className="brand">
        <Link href="/">MeetingLoop AI</Link>
        <span>{displayName}</span>
      </div>
      <nav className="topbar-nav" aria-label="주요 메뉴">
        <Link href="/">녹음 작업대</Link>
        <Link href="/meetings">회의록 목록</Link>
        <Link href="/meetings/new">새 회의</Link>
        <form action={logoutAction}>
          <button className="button secondary" type="submit">로그아웃</button>
        </form>
      </nav>
    </header>
  );
}
