import Link from "next/link";

/** The PRism mark and name, linking home. Shared by the login and demo headers. */
export default function BrandLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-accent-solid text-white">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 17l9 4 9-4" />
          <path d="M3 12l9 4 9-4" />
        </svg>
      </span>
      <span className="brand-text text-3xl">PRism</span>
    </Link>
  );
}
