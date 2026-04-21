import React, { useState, useEffect, useCallback, useRef } from "react";
import BarcodeScanner from "./components/BarcodeScanner";
import { Product, CartItem } from "./types";
import { Plus, Minus, Trash2, Printer, ScanLine, ShoppingCart, Loader2, Download, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const GAS_URL = import.meta.env.VITE_GAS_API_URL;

export default function App() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIframe, setIsIframe] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHardwareScan, setLastHardwareScan] = useState<number | null>(null);
  const [showHardwareInfo, setShowHardwareInfo] = useState(false);
  
  // Ref for hardware scanner buffer
  const scannerBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  // Check environment and setup global listeners
  useEffect(() => {
    setIsIframe(window.self !== window.top);
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);

    // PWA Install Prompt
    const installHandler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    // Hardware Scanner Listener (Keyboard Emulator)
    const hardwareScannerHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const now = Date.now();
      if (now - lastKeyTimeRef.current > 100) {
        scannerBufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter") {
        if (scannerBufferRef.current.length > 3) {
          handleScan(scannerBufferRef.current);
          setLastHardwareScan(Date.now());
          // Clear pulse after 2 seconds
          setTimeout(() => setLastHardwareScan(null), 2000);
        }
        scannerBufferRef.current = "";
      } else if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
      }
    };

    window.addEventListener('beforeinstallprompt', installHandler);
    window.addEventListener('keydown', hardwareScannerHandler);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', installHandler);
      window.removeEventListener('keydown', hardwareScannerHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // ... rest of state ...
  const lastProcessedRef = useRef<{ barcode: string; time: number } | null>(null);

  // Auto-clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const fetchProduct = useCallback(async (barcode: string) => {
    // ... existing mock logic ...
    if (!GAS_URL || GAS_URL.includes("YOUR_SCRIPT_ID")) {
      console.warn("GAS URL not set. Using mock data.");
      await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network lag
      return {
        barcode,
        name: `Product ${barcode.slice(-4)}`,
        price: Math.floor(Math.random() * 100000) + 1000,
        imageUrl: `https://picsum.photos/seed/${barcode}/200/200`
      };
    }

    try {
      const response = await fetch(`${GAS_URL}?action=getProduct&barcode=${barcode}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      return data as Product;
    } catch (err) {
      console.error("Fetch product error:", err);
      throw err;
    }
  }, []);

  const handleScan = async (barcode: string) => {
    const now = Date.now();
    
    // 1. Prevent double processing of same barcode
    if (lastProcessedRef.current && 
        lastProcessedRef.current.barcode === barcode && 
        (now - lastProcessedRef.current.time) < 2500) {
      return; 
    }

    // 2. Prevent overlapping scans
    if (isProcessing) return;

    // Reset states immediately for new scan
    setError(null);
    setIsProcessing(true);
    setLastScanned(barcode);
    setIsLoading(true);

    // Update the ref to track this new attempt
    lastProcessedRef.current = { barcode, time: now };

    try {
      const product = await fetchProduct(barcode);
      addToCart(product);
      
      // Success: Clear loading immediately so status shows product name
      setIsLoading(false);
      
      // Cooldown to prevent laser re-triggering too fast
      setTimeout(() => {
        setIsProcessing(false);
        // We keep lastScanned for a bit so user sees what was added
        setTimeout(() => setLastScanned(null), 1000);
      }, 800); 

    } catch (err: any) {
      setError(err?.message || "Produk tidak ditemukan.");
      setIsLoading(false);
      setIsProcessing(false);
      // Allow immediate re-scan on error
      lastProcessedRef.current = null;
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.barcode === product.barcode);
      if (existing) {
        return prev.map(item => 
          item.barcode === product.barcode 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (barcode: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.barcode === barcode) {
        const nextQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: nextQty };
      }
      return item;
    }));
  };

  const removeFromCart = (barcode: string) => {
    setCart(prev => prev.filter(item => item.barcode !== barcode));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleManualInput = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const barcode = formData.get("barcode") as string;
    if (barcode) {
      handleScan(barcode);
      e.currentTarget.reset();
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
      {/* Floating Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 20, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
          >
            <div className="bg-red-500 border border-red-400/50 text-white p-4 rounded-2xl shadow-2xl shadow-red-900/40 flex items-center gap-4">
              <div className="bg-white/20 p-2.5 rounded-full shrink-0">
                <ScanLine size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black uppercase tracking-wider">Gagal Menemukan Barang</p>
                <p className="text-xs opacity-90 mt-0.5 font-medium">{error}</p>
                <div className="mt-2 py-1.5 px-2 bg-black/20 rounded-lg border border-white/5">
                  <p className="text-[10px] text-white/60">
                    <span className="text-blue-300 font-bold">Tips:</span> Pastikan barcode <span className="font-mono text-white">{lastScanned}</span> sudah ada di kolom A Google Sheets anda.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setError(null)}
                className="hover:bg-white/10 p-2 rounded-xl transition-colors shrink-0"
              >
                <Minus size={20} className="rotate-45" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full h-full max-w-6xl flex flex-col lg:flex-row gap-6">
        
        {/* Left Side: Header & Scanner */}
        <div className="flex-1 flex flex-col gap-6 no-print">
          {/* Glass Header */}
          <header className="glass rounded-3xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <ScanLine size={24} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">Mini Kasir</h1>
            </div>
            <div className="flex items-center gap-4">
              <form onSubmit={handleManualInput} className="hidden md:flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 focus-within:border-blue-500/50 transition-colors">
                <input 
                  name="barcode"
                  type="text" 
                  placeholder="Input Barcode Manual..." 
                  className="bg-transparent border-none outline-none text-xs w-32 md:w-48 placeholder:text-white/20"
                />
                <button type="submit" className="text-blue-400 hover:text-blue-300">
                  <Plus size={16} />
                </button>
              </form>
              {!isIframe && !isStandalone && deferredPrompt && (
                <button 
                  onClick={handleInstallClick}
                  className="bg-blue-500 hover:bg-blue-400 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                >
                  <Download size={14} /> INSTALL WEBAPP
                </button>
              )}
              <div className="text-sm text-slate-400 hidden sm:block">
                {new Date().toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </header>

          {/* Scanner Container */}
          <div className="glass flex-1 rounded-3xl overflow-hidden relative border-blue-500/30 flex flex-col min-h-[500px]">
            <div className="absolute inset-0 bg-black/40 z-0"></div>
            {isScannerActive && <div className="absolute top-0 left-0 w-full scanner-line z-10"></div>}
            
            {/* Success Overlay */}
            <AnimatePresence>
              {isProcessing && !isLoading && !error && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-green-500/20 z-20 flex items-center justify-center backdrop-blur-[2px]"
                >
                  <motion.div 
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="bg-green-500 text-white p-4 rounded-full shadow-2xl shadow-green-500/50"
                  >
                    <Plus size={48} strokeWidth={3} />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="relative z-10 flex-1 flex flex-col p-6">
              <BarcodeScanner onScan={handleScan} onStatusChange={setIsScannerActive} />

              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-widest text-blue-400 font-bold">Status Sistem</p>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-medium leading-tight">
                      {!isScannerActive ? "Kamera Nonaktif" : 
                       isLoading ? "Mencari Produk..." : 
                       error ? (
                         <span className="text-red-400 text-sm block">
                           {error} <br/> 
                           <span className="text-[10px] text-white/40 block mt-1">Barcode: {lastScanned}</span>
                         </span>
                       ) : 
                       lastScanned ? `Terdeteksi: ${lastScanned}` : 
                       "Siap Memindai..."}
                    </h2>
                    
                    {/* Hardware Scanner Badge */}
                    <div className="group relative">
                      <motion.div 
                        onClick={() => setShowHardwareInfo(!showHardwareInfo)}
                        animate={lastHardwareScan ? { scale: [1, 1.15, 1], backgroundColor: ["rgba(59, 130, 246, 0.1)", "rgba(59, 130, 246, 0.5)", "rgba(59, 130, 246, 0.1)"] } : {}}
                        className="px-2 py-1 rounded-md border border-blue-500/20 bg-blue-500/10 flex items-center gap-1.5 cursor-pointer md:cursor-help"
                      >
                        <Zap size={10} className={lastHardwareScan ? "text-blue-300 animate-pulse" : "text-blue-500/40"} />
                        <span className="text-[9px] font-bold text-blue-400/80 uppercase">Hardware Ready</span>
                      </motion.div>
                      
                      {/* Tooltip - show on hover (desktop) or showHardwareInfo (mobile/tap) */}
                      <AnimatePresence>
                        {(showHardwareInfo) && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: -8, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute bottom-full left-0 mb-1 w-56 p-3 bg-slate-900 border border-blue-500/30 rounded-xl text-[10px] text-slate-300 shadow-2xl z-50 ring-1 ring-white/10"
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-blue-400 font-bold uppercase">Info Scanner Fisik</span>
                              <button onClick={(e) => { e.stopPropagation(); setShowHardwareInfo(false); }} className="text-white/40 hover:text-white">
                                <Plus size={10} className="rotate-45" />
                              </button>
                            </div>
                            Alat scanner laser (USB/Bluetooth) terdeteksi otomatis. Silakan tembak barcode langsung tanpa klik apapun. Label ini akan berkedip saat data diterima.
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      {/* Desktop only hover info (hidden on mobile via group-hover exclusion or just logic) */}
                      <div className="hidden md:group-hover:block absolute bottom-full left-0 mb-1 w-56 p-3 bg-slate-900 border border-blue-500/30 rounded-xl text-[10px] text-slate-300 shadow-2xl z-40 pointer-events-none">
                        Klik untuk tetap menampilkan info.
                      </div>
                    </div>
                  </div>
                </div>
                {error && (
                  <button 
                    onClick={() => setError(null)}
                    className="px-4 py-1.5 bg-red-500/20 border border-red-500/30 rounded-full text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    Reset Error
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Cart & Checkout */}
        <div className="w-full lg:w-[450px] flex flex-col gap-6 print:w-full print:gap-0">
          <div className="glass flex-1 rounded-3xl p-6 flex flex-col print:bg-transparent print:border-none print:p-0">
            <div className="flex justify-between items-center mb-6 no-print">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ShoppingCart size={20} className="text-blue-400" /> 
                Keranjang Belanja
                <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full ml-1 font-normal opacity-70">
                  {cart.length}
                </span>
              </h3>
              {cart.length > 0 && (
                <button 
                  onClick={() => setCart([])}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors font-medium underline underline-offset-4"
                >
                  Kosongkan
                </button>
              )}
            </div>

            <div className="hidden print:block text-center mb-8 text-black">
              <h1 className="text-3xl font-black uppercase italic">TRX RECEIPT</h1>
              <p className="text-sm opacity-60">Mini Kasir - {new Date().toLocaleString()}</p>
              <div className="border-b-2 border-dashed border-black my-4 opacity-20" />
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto max-h-[50vh] lg:max-h-none pr-2 custom-scrollbar print:overflow-visible print:max-h-none print:pr-0">
              <AnimatePresence mode="popLayout" initial={false}>
                {cart.map((item) => (
                  <motion.div
                    key={item.barcode}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group print:bg-transparent print:border-b print:border-black/10 print:rounded-none print:p-2 print:text-black"
                  >
                    <img 
                      src={item.imageUrl} 
                      className="w-16 h-16 object-cover rounded-xl shadow-lg shadow-black/20 print:hidden" 
                      alt={item.name} 
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate text-sm">{item.name}</h4>
                      <p className="text-blue-400 font-bold text-xs mt-0.5 print:text-black">
                        Rp {item.price.toLocaleString("id-ID")}
                      </p>
                      
                      <div className="flex items-center gap-3 mt-3 no-print">
                        <div className="flex items-center bg-black/40 rounded-lg overflow-hidden border border-white/10">
                          <button 
                            onClick={() => updateQuantity(item.barcode, -1)}
                            disabled={item.quantity <= 1}
                            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 disabled:opacity-20 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(item.barcode, 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.barcode)}
                          className="text-red-400/60 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="hidden print:block text-right">
                      <p className="text-xs">x{item.quantity}</p>
                      <p className="font-bold text-sm">Rp {(item.price * item.quantity).toLocaleString("id-ID")}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {cart.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 no-print">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <ShoppingCart size={32} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm">Keranjang anda kosong.<br/>Silahkan scan produk.</p>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="mt-6 pt-6 border-t border-white/10 space-y-5 print:border-none print:mt-4 print:p-0 print:text-black">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 print:text-black print:opacity-60 text-sm font-medium">Total Pembayaran</span>
                  <span className="text-2xl font-bold text-blue-400 print:text-black">
                    Rp {total.toLocaleString("id-ID")}
                  </span>
                </div>
                
                <button 
                  onClick={handlePrint}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-bold text-lg shadow-xl shadow-blue-900/40 transition-all flex items-center justify-center gap-3 no-print active:scale-[0.98]"
                >
                  <Printer size={22} /> PRINT NOTA
                </button>

                <div className="hidden print:block text-center mt-12 text-black">
                  <div className="border-b-2 border-dashed border-black my-4 opacity-20" />
                  <p className="text-lg font-bold">TERIMA KASIH</p>
                  <p className="text-xs opacity-60 italic">Mini Kasir - Point of Sale System</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
