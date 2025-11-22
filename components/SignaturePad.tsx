'use client';

import { useRef, useState, useEffect } from 'react';
import { Button, Flex, Box, Text } from '@radix-ui/themes';

interface SignaturePadProps {
  onSave: (signatureData: string) => void;
  onCancel: () => void;
  providerName: string;
}

export default function SignaturePad({ onSave, onCancel, providerName }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = 600;
    canvas.height = 200;

    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) {
      alert('Please provide a signature');
      return;
    }

    const signatureData = canvas.toDataURL('image/png');
    onSave(signatureData);
  };

  return (
    <Flex direction="column" gap="4">
      <Box>
        <Text as="label" size="2" weight="medium" mb="2" style={{ display: 'block' }}>
          Digital Signature - {providerName}
        </Text>
        <Box
          style={{
            border: '2px solid var(--gray-6)',
            borderRadius: 'var(--radius-2)',
            backgroundColor: 'white',
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{
              width: '100%',
              cursor: 'crosshair',
              touchAction: 'none',
            }}
          />
        </Box>
        <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
          Sign above using your mouse or touch screen
        </Text>
      </Box>
      <Flex justify="between" align="center">
        <Button variant="soft" color="gray" onClick={clearSignature}>
          Clear
        </Button>
        <Flex gap="2">
          <Button variant="outline" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="solid" color="blue" onClick={handleSave}>
            Save Signature
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

