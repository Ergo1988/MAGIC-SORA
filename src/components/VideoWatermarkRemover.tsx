import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import workerURL from '@ffmpeg/ffmpeg/worker?url';
import { Upload, Play, Download, Loader2, Video, X, Crop, Plus, Trash2 } from 'lucide-react';

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function VideoWatermarkRemover() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ffmpegRef = useRef<FFmpeg>(new FFmpeg());
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bounding boxes state
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  const load = async () => {
    setIsLoading(true);
    const ffmpeg = ffmpegRef.current;
    
    ffmpeg.on('progress', ({ progress }) => {
      setProgress(Math.round(progress * 100));
    });

    try {
      await ffmpeg.load({
        coreURL,
        wasmURL,
        classWorkerURL: workerURL,
      });
      setLoaded(true);
    } catch (err) {
      console.error(err);
      setError('Failed to load FFmpeg. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setProcessedVideoUrl(null);
      setBoxes([]);
      setCurrentBox(null);
      setProgress(0);
      setError(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !videoRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const width = Math.abs(currentX - startPos.x);
    const height = Math.abs(currentY - startPos.y);
    
    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentBox && currentBox.width > 10 && currentBox.height > 10) {
      setBoxes([...boxes, { ...currentBox, id: Math.random().toString(36).substr(2, 9) }]);
    }
    setIsDrawing(false);
    setCurrentBox(null);
  };

  const removeBox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBoxes(boxes.filter(b => b.id !== id));
  };

  const processVideo = async () => {
    if (!videoFile || boxes.length === 0 || !videoRef.current || !containerRef.current) return;
    
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    
    try {
      const ffmpeg = ffmpegRef.current;
      
      const video = videoRef.current;
      const container = containerRef.current;
      
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      const scaleX = videoWidth / containerWidth;
      const scaleY = videoHeight / containerHeight;
      
      // Build filter chain for multiple watermarks
      const filterChain = boxes.map(box => {
        let actualX = Math.round(box.x * scaleX);
        let actualY = Math.round(box.y * scaleY);
        let actualWidth = Math.round(box.width * scaleX);
        let actualHeight = Math.round(box.height * scaleY);
        
        actualX = Math.max(0, Math.min(actualX, videoWidth - 1));
        actualY = Math.max(0, Math.min(actualY, videoHeight - 1));
        actualWidth = Math.max(1, Math.min(actualWidth, videoWidth - actualX));
        actualHeight = Math.max(1, Math.min(actualHeight, videoHeight - actualY));
        
        return `delogo=x=${actualX}:y=${actualY}:w=${actualWidth}:h=${actualHeight}`;
      }).join(',');
      
      const ext = videoFile.name.split('.').pop() || 'mp4';
      const inputName = `input.${ext}`;
      const outputName = `output.${ext}`;
      
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));
      
      await ffmpeg.exec([
        '-i', inputName,
        '-vf', filterChain,
        '-c:a', 'copy',
        outputName
      ]);
      
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: videoFile.type || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      setProcessedVideoUrl(url);
    } catch (err) {
      console.error(err);
      setError('An error occurred while processing the video. Make sure the selected areas are within the video bounds.');
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setProcessedVideoUrl(null);
    setBoxes([]);
    setCurrentBox(null);
    setProgress(0);
    setError(null);
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Video Watermark Remover</h1>
        <p className="text-gray-600">Select multiple watermarks and remove them all with a single click. Uses spatial interpolation to minimize blurring.</p>
      </div>

      {!loaded ? (
        <div className="flex flex-col items-center justify-center p-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Loading video processing engine...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-start">
              <div className="flex-1">{error}</div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {!videoUrl ? (
            <label className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer group">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-indigo-600" />
              </div>
              <span className="text-lg font-medium text-gray-900">Click to upload video</span>
              <span className="text-sm text-gray-500 mt-1">MP4, WebM, or MOV</span>
              <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
            </label>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                  <Video className="w-4 h-4" />
                  <span className="truncate max-w-[200px]">{videoFile?.name}</span>
                </div>
                <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1 rounded-md hover:bg-gray-200 transition-colors">
                  Start Over
                </button>
              </div>

              <div className="p-6">
                {!processedVideoUrl ? (
                  <div className="space-y-6 flex flex-col items-center">
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-medium text-gray-900 flex items-center justify-center gap-2">
                        <Crop className="w-5 h-5 text-indigo-500" />
                        Select Watermarks
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">Click and drag to select multiple watermarks. We will optimize the removal to blend with the background.</p>
                    </div>

                    <div 
                      className="relative bg-black rounded-lg overflow-hidden shadow-inner select-none cursor-crosshair"
                      style={{ width: 'fit-content' }}
                      ref={containerRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      <video 
                        ref={videoRef}
                        src={videoUrl} 
                        className="max-h-[600px] w-auto pointer-events-none"
                        controls={false}
                        autoPlay
                        loop
                        muted
                      />
                      
                      {/* Render completed boxes */}
                      {boxes.map((box, index) => (
                        <div 
                          key={box.id}
                          className="absolute border-2 border-green-500 bg-green-500/20 group"
                          style={{
                            left: `${box.x}px`,
                            top: `${box.y}px`,
                            width: `${box.width}px`,
                            height: `${box.height}px`,
                          }}
                        >
                          <div className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded shadow-sm whitespace-nowrap flex items-center gap-1">
                            <span>Area {index + 1}</span>
                            <button 
                              onClick={(e) => removeBox(box.id, e)}
                              className="ml-1 hover:text-red-200"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Render currently drawing box */}
                      {currentBox && (
                        <div 
                          className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none"
                          style={{
                            left: `${currentBox.x}px`,
                            top: `${currentBox.y}px`,
                            width: `${currentBox.width}px`,
                            height: `${currentBox.height}px`,
                          }}
                        />
                      )}
                    </div>

                    <div className="flex justify-center pt-4 w-full">
                      <button
                        onClick={processVideo}
                        disabled={boxes.length === 0 || isProcessing}
                        className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-8 py-4 rounded-xl font-medium transition-colors shadow-sm text-lg w-full max-w-md justify-center"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span>Processing ({progress}%)</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-6 h-6" />
                            <span>Remove All Watermarks</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    {isProcessing && (
                      <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-2.5 mt-4 overflow-hidden">
                        <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6 flex flex-col items-center">
                    <div className="text-center mb-4">
                      <h3 className="text-2xl font-medium text-gray-900 text-green-600">Processing Complete!</h3>
                      <p className="text-gray-500 mt-1">Your video is ready to download.</p>
                    </div>

                    <div className="relative bg-black rounded-lg overflow-hidden shadow-inner w-fit">
                      <video 
                        src={processedVideoUrl} 
                        className="max-h-[600px] w-auto"
                        controls
                        autoPlay
                        loop
                      />
                    </div>

                    <div className="flex justify-center pt-4 w-full">
                      <a
                        href={processedVideoUrl}
                        download={`cleaned_${videoFile?.name || 'video.mp4'}`}
                        className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-medium transition-colors shadow-sm text-lg w-full max-w-md"
                      >
                        <Download className="w-6 h-6" />
                        <span>Download Video</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
