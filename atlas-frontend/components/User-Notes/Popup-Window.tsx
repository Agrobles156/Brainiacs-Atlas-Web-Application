import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
// import RichTextEditor from './Text-Editor/RichTextEditor';
// import { SimpleEditor } from './Text-Editor/tiptap-templates/simple/simple-editor';

const handleClick = () => {
    const router = useRouter();
    router.push('/create.tsx');
};

interface Notes {
    _id: string;
    title: string;
    content: string;
    region?: string;
}

interface PopupWindowProps {
    note: Notes;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updateNote: Notes) => void;
}

interface SimpleEditorProps {
    content: string;
    onChange: (content: string) => void;
  }

const PopupWindow: React.FC<PopupWindowProps> = ({ note, isOpen, onClose, onSave }) => {
    const [editNote, setEditNote] = useState<Notes>(note);

    useEffect(() => {
        setEditNote(note);
    }, [note]);

    if(!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(editNote);
    }

    const handleChange = (content: string) => {
        setEditNote({...editNote, content});
    }

    return (
        <div className = "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className = "bg-white p-6 rounded-lg w-full max-w-2xl">
            <h2 className = "text-xl font-bold mb-4">Editor</h2>
            
            <form onSubmit = {handleSubmit}>
                <div className='flex items-center gap-2'>
                    <input
                        type = "text"
                        value = {editNote.title}
                        onChange = {(e) => setEditNote({ ...editNote, title: e.target.value })}
                        placeholder = "Title"
                        className = "w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:border-gray-600"
                    />
                    {/* Drop down? Get this data from the svg files. Or manual input? */}
                    <div className = 'flex flex-row gap-2'>
                        <input
                            type = "text"
                            value = {editNote.region}
                            onChange = {(e) => setEditNote({ ...editNote, region: e.target.value})}
                            placeholder = 'Region'
                            className = "w-full p-2 border rounded mb-4"
                        />
                    </div>
                </div>

                <textarea
                    value = {editNote.content}
                    onChange = {(e) => setEditNote({ ...editNote, content: e.target.value })}
                    placeholder = 'Note Content'
                    className = "w-full p-2 border rounded mb-4 h-48"
                />   

               {/* <SimpleEditor /> */} {/* RICH TEXT EDITOR */}

                <div className = "flex justify-end gap-2 mt-4">
                    <button onClick = {onClose} className = "px-4 py-2 bg-gray-200 rounded-md ml-2 hover:bg-gray-300">
                        Cancel
                    </button>
                    <button onClick = {() => onSave(editNote)} className = "px-4 py-2 bg-blue-500 text-white rounded-md ml-2 hover:bg-blue-600">
                        Save
                    </button>
                </div>   
            </form>
        </div>
    </div>
    );
};

export default PopupWindow;