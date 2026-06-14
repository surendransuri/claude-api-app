// Intentionally unused - home route is handled by app/page.tsx
// This file exists only to maintain the (main) route group folder structure
// Delete this file before running `next build` if you encounter a route conflict error
import { redirect } from 'next/navigation'
export default function UnusedPage() {
  redirect('/')
}
