'use client'
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const Navbar = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDatabase, setSelectedDatabase] = useState("pubmed"); // Default to PubMed

    const [whoami, setWhoAmI] = useState<string | null>(null)
    
    return (
        <header className="px-5 py-3 bg-primary shadow-sm font-work-sans">
            <nav className="max-w-7xl mx-auto px-4">
                <div className="flex justify-between items-center">
                    <Link href="/" passHref>
                        <Image src="/logo.png" alt="Logo" width={200} height={50} priority />
                    </Link>
                    <div className='flex items-center gap-6'>
                        <div className='text-gray-400 text-xl'>
                            {whoami == "Not Signed In" || whoami == null ?"Please login to use the Atlas to it's full potential": "Hello "+whoami}
                        </div>
                        {whoami && whoami !== "Not Signed In" && (
                            <Link href="/settings" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">
                                ⚙️ Settings
                            </Link>
                        )}
                    </div>
                </div>
            </nav>
        </header>
    );
};

export default Navbar;