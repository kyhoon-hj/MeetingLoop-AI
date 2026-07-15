const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#008a4b"/><path d="M16 46V18h8l8 13 8-13h8v28h-8V31l-8 12-8-12v15z" fill="#fff"/></svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml"
    }
  });
}
