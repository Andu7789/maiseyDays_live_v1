import React, { useEffect, useRef, useState } from "react";

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
}

/** Draw-with-finger/mouse signature pad. Reports a PNG data URL via onChange, or null when empty. */
const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const hasInk = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
    }
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Dot for a single tap
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    isDrawing.current = true;
    hasInk.current = true;
    setIsEmpty(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasInk.current) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    hasInk.current = false;
    setIsEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="relative border-2 border-dashed border-slate-300 rounded-2xl bg-white overflow-hidden">
        {isEmpty && <div className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold pointer-events-none select-none">✍️ Sign here with your finger or mouse</div>}
        <canvas ref={canvasRef} className="w-full h-40 touch-none block" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} />
      </div>
      <button type="button" onClick={handleClear} className="mt-2 text-sm font-bold text-slate-500 hover:text-slate-700 underline">
        Clear signature
      </button>
    </div>
  );
};

export default SignatureCanvas;
