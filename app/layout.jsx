import "./globals.css";
import CursorBuildPointers from "./components/CursorBuildPointers";
import CursorBuildScroll from "./components/CursorBuildScroll";

export const metadata = {
  title: "Chucks Shopping Mall — More Than a Place to Shop",
  description: "Discover Chucks Shopping Mall in Lokoja — a place for little discoveries, unexpected favourites and good days."
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}<CursorBuildScroll /><CursorBuildPointers /></body></html>;
}