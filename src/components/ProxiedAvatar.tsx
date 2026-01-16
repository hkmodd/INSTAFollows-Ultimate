import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ProxiedAvatarProps {
    url: string;
    username: string;
    className?: string;
}

/**
 * Avatar component that proxies images through Rust backend
 * to avoid CORS issues with Instagram CDN
 */
export function ProxiedAvatar({ url, username, className = "" }: ProxiedAvatarProps) {
    const [src, setSrc] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // Fallback avatar using initials
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=ec4899&color=fff&size=128`;

    useEffect(() => {
        let cancelled = false;

        const loadImage = async () => {
            try {
                setLoading(true);
                setError(false);

                // Try to proxy the image through Rust backend
                const dataUrl = await invoke<string>("proxy_pic", { url });

                if (!cancelled) {
                    setSrc(dataUrl);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) {
                    // Fall back to initials avatar
                    setSrc(fallbackUrl);
                    setError(true);
                    setLoading(false);
                }
            }
        };

        loadImage();

        return () => {
            cancelled = true;
        };
    }, [url, fallbackUrl]);

    if (loading) {
        return (
            <div className={`bg-gray-700 animate-pulse ${className}`}>
                <span className="sr-only">Loading...</span>
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={username}
            className={className}
            onError={() => {
                if (!error) {
                    setSrc(fallbackUrl);
                    setError(true);
                }
            }}
        />
    );
}
