import "./index.css";

import Landing from "./Landing";
import TransferFlow from "./transfer/TransferFlow";
import Theory from "./theory/Theory";
import ReceiveEntry from "./receive/ReceiveEntry";
import { useRoute } from "./router";

export default function App() {
  const { path, code } = useRoute();

  if (path === "/send") return <TransferFlow />;
  if (path === "/receive") return <ReceiveEntry />;
  if (path.startsWith("/r/") && code) return <TransferFlow joinCode={code} />;
  if (path === "/how") return <Theory />;

  return <Landing />;
}
