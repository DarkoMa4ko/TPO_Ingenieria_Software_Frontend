import { useEffect, useState } from 'react';

// Franjas de cine que entran durante las cinemáticas, con un rótulo entre dos
// líneas en la de abajo y, arriba de él, quién hizo la jugada.
export default function Franjas({ activa, texto, sub, tipo }) {
  const [rotulo, setRotulo] = useState({ texto, sub });
  useEffect(() => { if (texto) setRotulo({ texto, sub }); }, [texto, sub]);

  return (
    <div className={`franjas ${activa ? 'activa' : ''} ${tipo === 'mate' ? 'mate' : ''}`} aria-hidden={!activa}>
      <div className="franja arriba" />
      <div className="franja abajo">
        <div className="rotulo" key={`${rotulo.sub}-${rotulo.texto}`}>
          {rotulo.sub && <span className="rotulo-sub">{rotulo.sub}</span>}
          <div className="rotulo-fila">
            <span className="rotulo-linea" aria-hidden="true" />
            <span className="rotulo-texto">{rotulo.texto}</span>
            <span className="rotulo-linea" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
