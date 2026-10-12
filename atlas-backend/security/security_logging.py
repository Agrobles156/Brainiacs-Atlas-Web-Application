import logging
import os
from flask import request

def log_security_event(event, details=None):
    log_file = os.path.join(os.path.dirname(__file__), '..', 'security_events.log')
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    logger = logging.getLogger('security')
    msg = f"SECURITY EVENT: {event}"
    if details:
        msg += f" | Details: {details}"
    logger.info(msg)
