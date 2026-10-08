import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <span className="eyebrow">404 / LOST IN THE GAME</span>
      <h1>ยังไม่มีหน้านี้ในคลัง</h1>
      <p>ลิงก์อาจเปลี่ยนไป หรือรายการยังไม่เผยแพร่</p>
      <Link className="button primary" href="/">
        กลับไปค้นพบเกม
      </Link>
    </main>
  );
}
