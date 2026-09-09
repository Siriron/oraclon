import { Routes, Route } from 'react-router-dom';
import Landing from './components/Landing.jsx';
import AppShell from './components/AppShell.jsx';
import Ledger from './components/Ledger.jsx';
import NewDispute from './components/NewDispute.jsx';
import DisputeDetail from './components/DisputeDetail.jsx';
import NotFound from './components/NotFound.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Ledger />} />
          <Route path="new" element={<NewDispute />} />
          <Route path="dispute/:id" element={<DisputeDetail />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
