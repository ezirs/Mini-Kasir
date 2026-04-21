import { Html5Qrcode } from "html5-qrcode";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, RefreshCcw, Play, Square } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onStatusChange?: (isScanning: boolean) => void;
}

interface CameraDevice {
  id: string;
  label: string;
}

export default function BarcodeScanner({ onScan, onStatusChange }: BarcodeScannerProps) {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const updateScanningStatus = (status: boolean) => {
    setIsScanning(status);
    onStatusChange?.(status);
  };

  const getCameras = useCallback(async () => {
    if (isScanning) return; // Prevent refreshing while camera is busy
    setError(null);
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Default to the first back camera if available
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes("back") || 
          d.label.toLowerCase().includes("environment") ||
          d.label.toLowerCase().includes("belakang")
        );
        setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
        setError(null);
      } else {
        setError("Kamera tidak ditemukan. Pastikan kamera terhubung.");
      }
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || String(err).includes("denied")) {
        setError("Izin kamera ditolak. Jika anda menggunakan aplikasi ini di dalam 'embed/iframe', pastikan aplikasi induk anda memberikan akses kamera (atribut allow='camera').");
      } else {
        setError("Gagal mengakses kamera. Pastikan browser anda mengizinkan akses kamera.");
      }
      console.error(err);
    }
  }, []);

  useEffect(() => {
    getCameras();
    html5QrCodeRef.current = new Html5Qrcode("reader");

    return () => {
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(e => console.error(e));
        onStatusChange?.(false);
      }
    };
  }, [getCameras, onStatusChange]);

  const startScanning = async () => {
    if (!html5QrCodeRef.current || !selectedCameraId) return;

    try {
      await html5QrCodeRef.current.start(
        selectedCameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
        },
        (decodedText) => {
          onScan(decodedText);
        },
        undefined // ignore individual scan errors
      );
      updateScanningStatus(true);
      setError(null);
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || String(err).includes("denied")) {
        setError("Izin akses kamera diblokir. Harap izinkan melalui pengaturan browser atau pastikan atribut allow='camera' ada di tag iframe anda.");
      } else if (String(err).toLowerCase().includes("could not start video source") || String(err).toLowerCase().includes("readableerror")) {
        setError("Kamera sedang digunakan oleh aplikasi lain (seperti Zoom, WhatsApp, atau tab browser lain). Tutup aplikasi tersebut dan coba lagi.");
      } else {
        setError("Gagal menyalakan kamera. Silakan pilih kamera lain atau refresh halaman.");
      }
      console.error(err);
    }
  };

  const stopScanning = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        updateScanningStatus(false);
      } catch (err) {
        console.error("Gagal mematikan kamera:", err);
      }
    }
  };

  return (
    <div className="w-full max-w-md mx-auto h-full flex flex-col">
      <div className="camera-select-container no-print">
        <label className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <Camera size={14} /> Pilih Kamera
        </label>
        
        <div className="flex gap-2">
          {cameras.length > 0 ? (
            <select 
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              disabled={isScanning}
              className="flex-1 min-w-0"
            >
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Camera ${camera.id}`}
                </option>
              ))}
            </select>
          ) : (
            <button 
              onClick={getCameras}
              className="flex-1 btn-secondary text-xs py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20"
            >
              <RefreshCcw size={14} className="mr-2" /> 
              Deteksi Kamera (Klik untuk Izin)
            </button>
          )}
          {cameras.length > 0 && (
            <button 
              onClick={getCameras}
              disabled={isScanning}
              className={`p-2 rounded-lg border transition-all ${
                isScanning 
                  ? "bg-white/5 border-white/5 opacity-20 cursor-not-allowed" 
                  : "bg-white/5 border-white/10 hover:bg-white/10 active:scale-95"
              }`}
              title={isScanning ? "Matikan kamera sebelum refresh" : "Refresh list kamera"}
            >
              <RefreshCcw size={16} className={isScanning ? "" : "text-blue-400"} />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {!isScanning ? (
            <button 
              onClick={startScanning}
              className="btn-primary flex-1"
              disabled={cameras.length === 0}
            >
              <Play size={18} fill="currentColor" /> Mulai Scan
            </button>
          ) : (
            <button 
              onClick={stopScanning}
              className="btn-secondary flex-1 bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30"
            >
              <Square size={18} fill="currentColor" /> Matikan Kamera
            </button>
          )}
        </div>

        {error && (
          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-[10px] text-red-400 font-medium leading-relaxed">
              {error}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden rounded-2xl bg-black/40 border border-white/5 backdrop-blur-sm">
        <div id="reader" className="w-full h-full"></div>
        {!isScanning && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 p-8 text-center text-sm border-2 border-dashed border-white/5 rounded-2xl">
            <p>Pilih kamera di atas <br/> lalu tekan "Mulai Scan"</p>
          </div>
        )}
      </div>
    </div>
  );
}
