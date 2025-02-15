import { Patch } from '@console/internal/module/k8s';
import { getName } from '../../../selectors';
import { toDataVolumeTemplateSpec } from '../../../selectors/dv/selectors';
import {
  getDataVolumeTemplates,
  getDisks,
  getInterfaces,
  getVolumeDataVolumeName,
  getVolumes,
} from '../../../selectors/vm';
import { V1alpha1DataVolume, V1Disk, V1Volume } from '../../../types/api';
import { VMLikeEntityKind } from '../../../types/vmLike';
import { getSimpleName } from '../../../utils';
import { PatchBuilder } from '../../helpers/patch';
import { DiskWrapper } from '../../wrapper/vm/disk-wrapper';
import { getVMLikePatches } from '../vm-template';
import { getShiftBootOrderPatches } from './utils';

export const getRemoveDiskPatches = (vmLikeEntity: VMLikeEntityKind, disk: V1Disk): Patch[] => {
  return getVMLikePatches(vmLikeEntity, (vm) => {
    const diskWrapper = new DiskWrapper(disk);
    const diskName = diskWrapper.getName();
    const disks = getDisks(vm);
    const volumes = getVolumes(vm);
    const volume = volumes.find((v) => getSimpleName(v) === diskName);

    const patches = [
      new PatchBuilder('/spec/template/spec/domain/devices/disks')
        .setListRemove(disks, (item) => getSimpleName(item) === diskName)
        .build(),
      new PatchBuilder('/spec/template/spec/volumes')
        .setListRemove(volumes, (item) => getSimpleName(item) === getSimpleName(volume))
        .build(),
    ];

    const dataVolumeName = getVolumeDataVolumeName(volume);

    if (dataVolumeName) {
      patches.push(
        new PatchBuilder('/spec/dataVolumeTemplates')
          .setListRemove(getDataVolumeTemplates(vm), (item) => getName(item) === dataVolumeName)
          .build(),
      );
    }

    if (diskWrapper.hasBootOrder()) {
      return [
        ...patches,
        ...getShiftBootOrderPatches(
          '/spec/template/spec/domain/devices/disks',
          disks,
          diskName,
          diskWrapper.getBootOrder(),
        ),
        ...getShiftBootOrderPatches(
          '/spec/template/spec/domain/devices/interfaces',
          getInterfaces(vm),
          null,
          diskWrapper.getBootOrder(),
        ),
      ];
    }

    return patches;
  });
};

export const getUpdateDiskPatches = (
  vmLikeEntity: VMLikeEntityKind,
  {
    disk,
    volume,
    dataVolume,
    oldDiskName,
    oldVolumeName,
    oldDataVolumeName,
  }: {
    disk: V1Disk;
    volume: V1Volume;
    dataVolume?: V1alpha1DataVolume;
    oldDiskName?: string;
    oldVolumeName?: string;
    oldDataVolumeName?: string;
  },
): Patch[] =>
  getVMLikePatches(vmLikeEntity, (vm) => {
    const disks = getDisks(vm, null);
    const volumes = getVolumes(vm, null);
    const dataVolumeTemplates = getDataVolumeTemplates(vm, null);

    return [
      new PatchBuilder('/spec/template/spec/domain/devices/disks')
        .setListUpdate(disk, disks, (other) => getSimpleName(other) === oldDiskName)
        .build(),
      new PatchBuilder('/spec/template/spec/volumes')
        .setListUpdate(volume, volumes, (other) => getSimpleName(other) === oldVolumeName)
        .build(),
      dataVolume &&
        new PatchBuilder('/spec/dataVolumeTemplates')
          .setListUpdate(
            toDataVolumeTemplateSpec(dataVolume),
            dataVolumeTemplates,
            (other) => getName(other) === oldDataVolumeName,
          )
          .build(),
    ].filter((patch) => patch);
  });
