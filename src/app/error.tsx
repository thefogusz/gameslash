"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <a className="wordmark" href="/">
        gameslash<span>/</span>
      </a>
      <h1>โหลดหน้าเว็บไม่สำเร็จ</h1>
      <p>ข้อมูลอาจยังไม่พร้อม ลองใหม่ได้อีกครั้ง</p>
      <button className="button primary" onClick={reset}>
        ลองใหม่
      </button>
    </main>
  );
}
