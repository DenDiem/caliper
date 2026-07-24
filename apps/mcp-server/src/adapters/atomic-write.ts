import {renameSync, writeFileSync} from 'node:fs';

// rename over an existing file is atomic on POSIX and on Windows/NTFS for
// same-volume renames, which this always is -- the temp file sits beside the target.
export const writeFileAtomic = (path: string, content: string): void => {
  const temporary = `${path}.caliper-tmp`;
  writeFileSync(temporary, content, 'utf8');
  renameSync(temporary, path);
};
