import "./globals.css";

export const metadata = {
  title: "Chucks Shopping Mall — Step Inside",
  description: "A new way to experience shopping at Chucks Shopping Mall, Lokoja. Explore the visual prototype."
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}