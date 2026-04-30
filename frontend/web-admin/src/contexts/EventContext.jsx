import { createContext, useContext, useState } from 'react';

const EventContext = createContext({});

export const EventProvider = ({ children }) => {
    const [currentEvent, setCurrentEvent] = useState({
        nome: 'Evento Exemplo'
    });

    return (
        <EventContext.Provider value={{ currentEvent, setCurrentEvent }}>
            {children}
        </EventContext.Provider>
    );
};

export const useEvent = () => useContext(EventContext);
