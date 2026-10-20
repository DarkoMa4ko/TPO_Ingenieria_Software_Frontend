import { useEffect, useRef } from 'react';

export default function ModalResultado({ resultado,rendicionInfo, onCerrar, onNueva }) {
  const cerrarRef = useRef(null);
  useEffect(() => {
    cerrarRef.current?.focus();
    const manejarTecla = (evento) => { if (evento.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [onCerrar]);

  const tablas = /tabla|empate|ahogado|stalemate|draw/i.test(resultado || '');
  const mate = /jaque[\s-]*mate|checkmate|mate/i.test(resultado || '');
  return (
    <div className="resultado-superposicion" role="presentation">
      <section className="resultado-dialogo" role="dialog" aria-modal="true" aria-labelledby="resultado-titulo" aria-describedby="resultado-descripcion">
        <div className="resultado-emblema" aria-hidden="true">{tablas ? '½–½' : mate ? '♛' : '♜'}</div>
        <div className="resultado-etiqueta">PARTIDA FINALIZADA</div>
        <h2 id="resultado-titulo">{rendicionInfo && /rendici/i.test(resultado || '') ? `¡${rendicionInfo.ganador} ha ganado!` : tablas ? '¡La partida termina en tablas!' : mate ? '¡Jaque mate!' : '¡Fin de la partida'}</h2>
        <p id="resultado-descripcion">{rendicionInfo && /rendici/i.test(resultado || '') ? `${rendicionInfo.perdedor} se ha rendido.` : resultado || 'La partida ha terminado.'}</p>
        <div className="resultado-botones">
          <button className="principal" onClick={onNueva}>＋ Nueva partida</button>
          <button className="secundario" ref={cerrarRef} onClick={onCerrar}>Ver tablero e historial</button>
        </div>
      </section>
    </div>
  );
}
