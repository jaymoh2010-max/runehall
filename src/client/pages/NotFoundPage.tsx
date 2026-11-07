import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";

export function NotFoundPage() {
  useEffect(() => {
    document.title = "Not found · Runehall";
  }, []);
  return (
    <div className="landing" style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 30, maxWidth: 520 }}>
        <div className="feature-icon" style={{ margin: "0 auto 18px" }}>
          <Compass size={22} />
        </div>
        <div className="page-eyebrow">404 · Lost on the road</div>
        <h1 style={{ marginTop: 8, fontSize: "2.4rem" }}>This path is not on the map.</h1>
        <p className="muted" style={{ marginTop: 14 }}>
          The page you're looking for has wandered off. The hall is still where you left it.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
          <Link to="/" className="btn btn-primary btn-md">
            <Home size={15} /> Back to the hall
          </Link>
        </div>
      </div>
    </div>
  );
}
