import LoginIcon from '@mui/icons-material/Login';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import { Alert, Button, Link, Snackbar, TextField, Typography } from '@mui/material';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import React, { createRef, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import {
  computeAllowlist,
  defaultAllowlist,
  getGeneralProfileUrl,
  getStorageItem,
  setStorageItem,
} from '../storage';
import { PUBLIC_WEBSITE } from '../urls';

const EditableList = () => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<'success' | 'error'>('success');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const allowlist = computeAllowlist(await getStorageItem('allowlist'));
      setText(allowlist.join('\n'));
    })().catch((e) => {
      console.error(e);
    });
  }, []);

  return (
    <>
      <Typography variant="h6">Allowlist</Typography>
      <Typography variant="body2">
        Domains to allow auto-completion. Use one regex per line.
      </Typography>

      <TextField
        variant="standard"
        fullWidth
        value={text}
        multiline
        rows={10}
        sx={{
          '& .MuiInputBase-root': {
            fontSize: '0.8rem',
            fontFamily: 'monospace',
          },
        }}
        onChange={(e) => setText(e.target.value)}
      ></TextField>

      <Button
        variant="text"
        onClick={async () => {
          const lst = text
            .split('\n')
            .map((x) => x.trim())
            .filter((x) => x !== '');
          for (const rule of lst) {
            try {
              new RegExp(rule);
            } catch (e) {
              setSeverity('error');
              setMessage(`Invalid regex: ${rule}`);
              setOpen(true);
              return;
            }
          }
          await setStorageItem('allowlist', { defaults: defaultAllowlist, current: lst });
          setSeverity('success');
          setMessage('Saved successfully');
          setOpen(true);
        }}
        sx={{
          float: 'right',
          textTransform: 'none',
        }}
      >
        Save Allowlist
        <SaveAltIcon />
      </Button>

      <Button
        variant="text"
        sx={{
          float: 'right',
          textTransform: 'none',
        }}
        onClick={async () => {
          try {
            await setStorageItem('allowlist', {
              defaults: defaultAllowlist,
              current: defaultAllowlist,
            });
            setText(defaultAllowlist.join('\n'));
            setSeverity('success');
            setMessage('Reset successfully');
            setOpen(true);
          } catch (e) {
            setSeverity('error');
            setMessage((e as Error).message);
            setOpen(true);
          }
        }}
      >
        Reset Allowlist <RestartAltIcon />
      </Button>

      <Snackbar
        open={open}
        autoHideDuration={3000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={severity} sx={{ width: '100%' }} onClose={() => setOpen(false)}>
          {message}
        </Alert>
      </Snackbar>
    </>
  );
};

const openTokenPage = async () => {
  const profileUrl = await getGeneralProfileUrl();
  if (profileUrl === undefined) {
    return;
  }
  const params = new URLSearchParams({
    response_type: 'token',
    redirect_uri: 'chrome-show-auth-token',
    scope: 'openid profile email',
    prompt: 'login',
    redirect_parameters_type: 'query',
    state: uuidv4(),
  });
  await chrome.tabs.create({ url: `${profileUrl}?${params}` });
};

const Options = () => {
  const tokenRef = createRef<HTMLInputElement>();
  const portalUrlRef = createRef<HTMLInputElement>();
  const [portalUrlText, setPortalUrlText] = useState('');
  const modelRef = createRef<HTMLInputElement>();
  const [modelText, setModelText] = useState('');
  const [jupyterlabKeybindingAcceptText, setJupyterlabKeybindingAcceptText] = useState('');
  const [jupyterlabKeybindingDismissText, setJupyterlabKeybindingDismissText] = useState('');
  const [jupyterNotebookKeybindingAcceptText, setJupyterNotebookKeybindingAcceptText] =
    useState('');
  const [jupyterDebounceMs, setJupyterDebounceMs] = useState(0);
  const jupyterDebounceMsRef = createRef<HTMLInputElement>();
  const [currentKey, setCurrentKey] = useState({
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  });
  const [jupyterlabAcceptInput, setJupyterlabAcceptInput] = useState(false);
  const [jupyterlabDismissInput, setJupyterlabDismissInput] = useState(false);
  const [notebookAcceptInput, setNotebookAcceptInput] = useState(false);

  const formatKeyCombination = (key: any) => {
    const modifiers = [];
    if (key.ctrl) modifiers.push('Ctrl');
    if (key.alt) modifiers.push('Alt');
    if (key.shift) modifiers.push('Shift');
    if (key.meta) modifiers.push('Meta');
    return [...modifiers, key.key.toUpperCase()].join('+');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const key = e.key;
    if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
      const ctrl = e.ctrlKey;
      const alt = e.altKey;
      const shift = e.shiftKey;
      const meta = e.metaKey;
      setCurrentKey({ key, ctrl, alt, shift, meta });

      // Force blur using setTimeout to ensure it happens after state update
      setTimeout(() => {
        if (e.currentTarget) {
          e.currentTarget.blur();
          // Also try to remove focus from the document
          (document.activeElement as HTMLElement)?.blur();
        }
      }, 0);
    }
  };

  useEffect(() => {
    (async () => {
      setPortalUrlText((await getStorageItem('portalUrl')) ?? '');
    })().catch((e) => {
      console.error(e);
    });
    (async () => {
      setModelText((await getStorageItem('enterpriseDefaultModel')) ?? '');
    })().catch((e) => {
      console.error(e);
    });
    (async () => {
      setJupyterlabKeybindingAcceptText(
        (await getStorageItem('jupyterlabKeybindingAccept')) ?? 'Tab'
      );
    })().catch((e) => {
      console.error(e);
    });
    (async () => {
      setJupyterlabKeybindingDismissText(
        (await getStorageItem('jupyterlabKeybindingDismiss')) ?? 'Escape'
      );
    })().catch((e) => {
      console.error(e);
    });
    (async () => {
      setJupyterNotebookKeybindingAcceptText(
        (await getStorageItem('jupyterNotebookKeybindingAccept')) ?? 'Tab'
      );
    })().catch((e) => {
      console.error(e);
    });
    (async () => {
      setJupyterDebounceMs((await getStorageItem('jupyterDebounceMs')) ?? 0);
    })().catch((e) => {
      console.error(e);
    });
  }, []);
  // TODO(prem): Deduplicate with serviceWorker.ts/storage.ts.
  const resolvedPortalUrl = useMemo(() => {
    if (portalUrlText !== '' || CODEIUM_ENTERPRISE) {
      return portalUrlText;
    }
    return PUBLIC_WEBSITE;
  }, []);

  return (
    <Box sx={{ width: '100%', maxWidth: 400, bgcolor: 'background.paper' }}>
      {!CODEIUM_ENTERPRISE && (
        <>
          <Typography variant="body2">
            <SettingsIcon
              fontSize="small"
              sx={{
                verticalAlign: 'bottom',
                marginRight: '0.2em',
                marginLeft: '0.4em',
                bottom: '-0.1em',
              }}
            />{' '}
            Edit telemetry settings at the{' '}
            <Link href={`${resolvedPortalUrl}/profile`} target="_blank">
              Codeium website
              <OpenInNewIcon
                fontSize="small"
                sx={{
                  verticalAlign: 'bottom',
                }}
              />
            </Link>
          </Typography>
          <Divider
            sx={{
              padding: '0.5em',
            }}
          />
        </>
      )}
      <Box sx={{ my: 2, mx: 2 }}>
        <Typography variant="h6"> Alternative ways to log in </Typography>
        <TextField
          id="token"
          label="Token"
          variant="standard"
          fullWidth
          type="password"
          inputRef={tokenRef}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="text" onClick={openTokenPage} sx={{ textTransform: 'none' }}>
            Get Token <OpenInNewIcon />
          </Button>

          <Button
            variant="text"
            onClick={async () => {
              // get token from input
              const token = tokenRef.current?.value;
              await chrome.runtime.sendMessage({ type: 'manual', token: token });
            }}
            sx={{ textTransform: 'none' }}
          >
            Enter Token <LoginIcon />
          </Button>
        </Box>
      </Box>
      <Divider
        sx={{
          padding: '0.5em',
        }}
      />
      <Box sx={{ my: 2, mx: 2 }}>
        <Typography variant="h6"> Enterprise settings </Typography>
        <TextField
          id="portal"
          label="Portal URL"
          variant="standard"
          fullWidth
          type="url"
          inputRef={portalUrlRef}
          value={portalUrlText}
          onChange={(e) => setPortalUrlText(e.target.value)}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="text"
            onClick={async () => {
              const portalUrl = portalUrlRef.current?.value;
              await setStorageItem('portalUrl', portalUrl);
            }}
            sx={{ textTransform: 'none' }}
          >
            Enter Portal URL <LoginIcon />
          </Button>
        </Box>
        <TextField
          id="model"
          label="Default Model"
          variant="standard"
          fullWidth
          inputRef={modelRef}
          value={modelText}
          onChange={(e) => setModelText(e.target.value)}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="text"
            onClick={async () => {
              const model = modelRef.current?.value;
              await setStorageItem('enterpriseDefaultModel', model);
            }}
            sx={{ textTransform: 'none' }}
          >
            Enter Default Model <LoginIcon />
          </Button>
        </Box>
      </Box>
      <Divider
        sx={{
          padding: '0.5em',
        }}
      />
      <Box sx={{ my: 2, mx: 2 }}>
        <EditableList />
      </Box>
      <Divider
        sx={{
          padding: '0.5em',
        }}
      />
      <Box sx={{ my: 2, mx: 2 }}>
        <Typography variant="h6"> Jupyter Settings </Typography>
        <Typography variant="body2">
          Press the desired key combination in the input field. For example, press "Ctrl+Tab" for a
          Ctrl+Tab shortcut.
        </Typography>

        <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
          JupyterLab
        </Typography>
        <TextField
          id="jupyterlabKeybindingAccept"
          label="Accept Shortcut"
          variant="standard"
          fullWidth
          value={jupyterlabAcceptInput ? 'Press keys...' : jupyterlabKeybindingAcceptText || 'Tab'}
          onFocus={() => setJupyterlabAcceptInput(true)}
          onBlur={async () => {
            setJupyterlabAcceptInput(false);
            if (currentKey.key) {
              const formatted = formatKeyCombination(currentKey);
              setJupyterlabKeybindingAcceptText(formatted);
              await setStorageItem('jupyterlabKeybindingAccept', formatted);
              setCurrentKey({ key: '', ctrl: false, alt: false, shift: false, meta: false });
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <TextField
          id="jupyterlabKeybindingDismiss"
          label="Dismiss Shortcut"
          variant="standard"
          fullWidth
          value={
            jupyterlabDismissInput ? 'Press keys...' : jupyterlabKeybindingDismissText || 'Escape'
          }
          onFocus={() => setJupyterlabDismissInput(true)}
          onBlur={async () => {
            setJupyterlabDismissInput(false);
            if (currentKey.key) {
              const formatted = formatKeyCombination(currentKey);
              setJupyterlabKeybindingDismissText(formatted);
              await setStorageItem('jupyterlabKeybindingDismiss', formatted);
              setCurrentKey({ key: '', ctrl: false, alt: false, shift: false, meta: false });
            }
          }}
          onKeyDown={handleKeyDown}
        />

        <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
          Jupyter Notebook
        </Typography>
        <TextField
          id="jupyterNotebookKeybindingAccept"
          label="Accept Shortcut"
          variant="standard"
          fullWidth
          value={
            notebookAcceptInput ? 'Press keys...' : jupyterNotebookKeybindingAcceptText || 'Tab'
          }
          onFocus={() => setNotebookAcceptInput(true)}
          onBlur={async () => {
            setNotebookAcceptInput(false);
            if (currentKey.key) {
              const formatted = formatKeyCombination(currentKey);
              setJupyterNotebookKeybindingAcceptText(formatted);
              await setStorageItem('jupyterNotebookKeybindingAccept', formatted);
              setCurrentKey({ key: '', ctrl: false, alt: false, shift: false, meta: false });
            }
          }}
          onKeyDown={handleKeyDown}
        />

        <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
          Performance
        </Typography>
        <TextField
          id="jupyterDebounceMs"
          label="Debounce (ms)"
          variant="standard"
          fullWidth
          type="number"
          inputRef={jupyterDebounceMsRef}
          value={jupyterDebounceMs}
          onChange={(e) => setJupyterDebounceMs(Number(e.target.value))}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="text"
            onClick={async () => {
              const debounceMs = parseInt(jupyterDebounceMsRef.current?.value ?? '0');
              await setStorageItem('jupyterDebounceMs', debounceMs);
            }}
            sx={{ textTransform: 'none' }}
          >
            Save <LoginIcon />
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default Options;
