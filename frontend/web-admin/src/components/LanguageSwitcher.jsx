import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Menu, MenuItem } from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';

const languages = [
    { code: 'pt-BR', name: 'Português' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' }
];

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();
    const [anchorEl, setAnchorEl] = React.useState(null);

    const handleClick = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
        handleClose();
    };

    return (
        <>
            <IconButton color="inherit" onClick={handleClick}>
                <TranslateIcon />
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
            >
                {languages.map((lng) => (
                    <MenuItem
                        key={lng.code}
                        selected={i18n.language === lng.code}
                        onClick={() => changeLanguage(lng.code)}
                    >
                        {lng.name}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}
