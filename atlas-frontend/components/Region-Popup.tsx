import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useRouter } from 'next/router';
import Modal from 'react-modal';
import { FC } from 'react';

const customStyles = {
    content: {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      marginRight: '-50%',
      transform: 'translate(-50%, -50%)',
    },
  };


const handleClick = () => {
    const router = useRouter();
    router.push('/user-notes.tsx'); // take to a specific page based on a user
};

interface RegionPopupProps {

    // selectedText: string | null;
    isOpen: boolean;
    onClose: () => void;
  }

// function RegionPopup({ isOpen, onClose }: RegionPopupProps) {
const RegionPopup: FC<RegionPopupProps> = ({ isOpen, onClose }) => {
    const [inputValue, setInputValue] = useState('');
    const [textInput, setTextInput] = useState('');
    // const [modalIsOpen, setIsOpen] = React.useState(false); // popup closed by default

    return (
        <Modal
            ariaHideApp={false} // Important for users of screen readers that other page content be hidden (via the aria-hidden attribute) 
                                // while the modal is open. To allow react-modal to do this, you should call Modal.setAppElement with a query
                                // selector identifying the root of your app. Temporary. Will enable this later.
            isOpen = {isOpen}
            onRequestClose = {onClose}
            style = {customStyles} // temp
            contentLabel = "Selected Region Popup"
          >
            {/* <h2 ref = {(_subtitle) => (subtitle = _subtitle)}>Swanson Notes</h2> */}
            
            <button onClick = {onClose}>
                <img src="/exit.png" alt="Close" className="w-4 h-4" /> 
            </button>
            <div>
                <div>
                    <form>
                        <input type = "text" 
                            id = "userNote"
                            value = {inputValue}                      
                            // onChange = {handleChange} 
                        />
                    </form>
                </div>
                <div className = "inline-flex gap-x-4 pl-4 pt-2">
                    {/* // If user wants to create a note they'll be redirected to a new page or should the popup box change? */}
                    <button onClick = {handleClick}>View More</button>
                    <button type = "submit">Create Note</button>
                </div>
            </div>
        </Modal>
      );
    }
//   }
export default RegionPopup;