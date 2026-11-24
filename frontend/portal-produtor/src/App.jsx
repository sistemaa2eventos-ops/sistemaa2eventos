import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PortalProdutor from './pages/PortalProdutor';

function App() {
    return (
        <Routes>
            <Route path="/" element={<PortalProdutor />} />
            <Route path="/portal-produtor/*" element={<PortalProdutor />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
