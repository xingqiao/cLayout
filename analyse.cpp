#pragma region 常量定义
// 单元格状态
const unsigned char COL_DEL = 0;  // 单元格已删除
const unsigned char ROW_DEL = 1;  // 该行已删除
const unsigned char BG_ITEM = 2;  // 纯色单元格
const unsigned char ACT_ITEM = 3; // 有效单元格
#pragma endregion

#pragma region 引入js定义的方法
extern "C" {

// 输出日志
void jsLog(int num);

// 统计背景色，由js实现
unsigned int getBgcolor(unsigned char *pos, int size);

}
#pragma endregion

#pragma region 内部方法

int getCeil(int a, int b)
{
    return b > 0 ? ((a / b) + (a % b > 0 ? 1 : 0)) : 0;
}

int getAbs(int a)
{
    return a > 0 ? a : -a;
}

// 计算颜色值
unsigned int calColor(int r, int g, int b)
{
    return 256 * (256 * r + g) + b;
}

// 存储int数值到char数组中
void setIntValue(unsigned char *ptr, int value)
{
    for (int i = 3; i >= 0; i--)
    {
        ptr[i] = value & 0xFF;
        value = value >> 8;
    }
}

// 存储裁剪结果
int saveSplitResult(unsigned char *startPtr, int left, int top, int right, int bottom, int width, int height, int size, int limit)
{
    // 转换坐标
    left *= size;
    top *= size;
    right = (right + 1) * size;
    bottom = (bottom + 1) * size;
    right = (right > width ? width : right) - 1;
    bottom = (bottom > height ? height : bottom) - 1;
    width = right - left + 1;
    height = bottom - top + 1;

    int count = 0;
    int _height = height;
    if (height > 0 && limit > 0) {
        _height = getCeil(height, getCeil(height, limit) * 15) * 15; // 进行分割，同时避免出现半像素导致的横线，2 * 2.5 * 3
    }
    while (height > 0)
    {
        int pos = count * 6 * 4;
        // 存放裁剪结果
        // [left, top, right, bottom, width, height]
        setIntValue(startPtr + pos, left);
        setIntValue(startPtr + pos + 4, top);
        setIntValue(startPtr + pos + 8, right);
        setIntValue(startPtr + pos + 12, bottom);
        setIntValue(startPtr + pos + 16, width);
        setIntValue(startPtr + pos + 20, height > _height ? _height : height);
        height -= _height;
        top += _height;
        count++;
    }

    return count;
}

/**
 * 计算单元索引
 * @param {unsigned char *} startPtr 数据开始指针
 * @param {int} bgR 背景色
 * @param {int} bgG 背景色
 * @param {int} bgB 背景色
 * @param {int} scope 容错值，解决因为压缩导致的颜色偏差
 * @param {int} colNum 列数
 * @param {int} rowNum 行数
 */
unsigned char *indexImg(unsigned char *startPtr, unsigned char bgR, unsigned char bgG, unsigned char bgB, int scope, int colNum, int rowNum)
{
    // 单元格大小
    int colSize = 4;

    // 索引指针
    int pos = 0;

    // 数据指针
    int dataPos = 0;

    for (int rowIndex = 0; rowIndex < rowNum; rowIndex++)
    {
        int rowPos = pos;
        bool rowEmpty = true;

        for (int colIndex = 0; colIndex < colNum; colIndex++)
        {
            if (startPtr[dataPos + 3] != ACT_ITEM)
            {
                // 过滤掉背景色单元格
                if (
                    (getAbs(startPtr[dataPos] - bgR) > scope) ||
                    (getAbs(startPtr[dataPos + 1] - bgG) > scope) ||
                    (getAbs(startPtr[dataPos + 2] - bgB) > scope))
                {
                    if (rowEmpty)
                    {
                        rowEmpty = false;
                    }
                    startPtr[pos] = ACT_ITEM;
                }
                else
                {
                    // 标记删除该单元格
                    startPtr[pos] = COL_DEL;
                }
            }
            else
            {
                if (rowEmpty)
                {
                    rowEmpty = false;
                }
                startPtr[pos] = ACT_ITEM;
            }

            pos++;
            dataPos += 4;
        }

        // 标记空行
        if (rowEmpty)
        {
            startPtr[rowPos] = ROW_DEL;
        }
    }

    return startPtr + pos;
}

/**
 * 分割图片
 * @param {unsigned char *} startPtr 数据开始指针
 * @param {unsigned char *} memPtr 当前指针
 * @param {int} colNum 列数
 * @param {int} leftIndex 左边界
 * @param {int} topIndex 上边界
 * @param {int} rightIndex 右边界
 * @param {int} bottomIndex 下边界
 * @param {int} width 图片宽度
 * @param {int} height 图片高度
 * @param {int} size 识别精度
 * @param {int} limit 切片高度，超过这个值会进行分割，值小于0时不进行切片
 * @return {int} 分割出的图片个数
 */
int splitImg(unsigned char *startPtr, unsigned char *memPtr, int colNum, int leftIndex, int topIndex, int rightIndex, int bottomIndex, int width, int height, int size, int limit)
{
    int top = -1;
    int left = -1;
    int right = -1;
    int bottom = -1;
    int count = 0;

    unsigned char *rowStartPtr = startPtr + topIndex * colNum;
    for (int rowIndex = topIndex; rowIndex <= bottomIndex; rowIndex++)
    {
        bool rowEmpty = rowStartPtr[0] == ROW_DEL;

        // 找出空行
        if (!rowEmpty)
        {
            rowEmpty = true;
            for (int colIndex = leftIndex; colIndex <= rightIndex; colIndex++)
            {
                if (rowStartPtr[colIndex] == ACT_ITEM)
                {
                    if (colIndex < left || left == -1)
                    {
                        left = colIndex;
                    }
                    if (colIndex > right)
                    {
                        right = colIndex;
                    }
                    rowEmpty = false;
                }
            }
        }

        // 发现空行或匹配到最后一行时，对之前匹配到的区域进行垂直分割
        if (rowEmpty || rowIndex == bottomIndex)
        {

            // 记录被分割的区域
            if (top >= 0)
            {
                if (!rowEmpty)
                {
                    bottom = rowIndex;
                }

                // 找出空列
                bool colEmpty;
                int _top = bottom;
                int _bottom = top;
                int _right;
                int _left = left;

                // 垂直分割
                unsigned char *topRowPtr = startPtr + top * colNum;
                unsigned char *_rowStartPtr;
                for (int x = left; x <= right; x++)
                {
                    colEmpty = true;
                    _rowStartPtr = topRowPtr;
                    for (int y = top; y <= bottom; y++)
                    {
                        if (_rowStartPtr[0] != ROW_DEL && _rowStartPtr[x] == ACT_ITEM)
                        {
                            if (y < _top)
                            {
                                _top = y;
                            }
                            if (y > _bottom)
                            {
                                _bottom = y;
                            }
                            colEmpty = false;
                        }
                        _rowStartPtr += colNum;
                    }

                    // 发现空列或已经匹配到最后一列时，判断是否有可以切割的图片，有的话将其添加到队列中
                    if (colEmpty || x == right)
                    {
                        _right = colEmpty ? x - 1 : right;
                        if (_bottom >= _top && _right >= _left)
                        {
                            // 如果匹配到的区域还存在继续分割的可能，就采用递归的方式继续进行匹配
                            if (_top != topIndex || _bottom != bottomIndex || _left != leftIndex || _right != rightIndex)
                            {
                                count += splitImg(startPtr, memPtr + count * 4 * 6, colNum, _left, _top, _right, _bottom, width, height, size, limit);
                            }
                            else
                            {
                                // 存储结果
                                count += saveSplitResult(memPtr + count * 4 * 6, _left, _top, _right, _bottom, width, height, size, limit);
                            }

                            // 恢复指针，开始下一轮匹配
                            _top = bottom;
                            _bottom = top;
                        }

                        // _left指针移动到下一列
                        _left = x + 1;
                    }
                }

                top = -1;
                left = -1;
                right = -1;
                bottom = -1;
            }
        }
        else
        {
            if (rowIndex < top || top == -1)
            {
                top = rowIndex;
            }
            if (rowIndex > bottom)
            {
                bottom = rowIndex;
            }
        }

        // 移动指针到下一行起始位置
        rowStartPtr += colNum;
    }

    return count;
}

#pragma endregion

#pragma region 提供给js的方法

extern "C" {

/**
 * @param {Image|Canvas} img 图片
 * @param {unsigned char *} startPtr 内存空间
 * @param {int} width 图片宽度
 * @param {int} height 图片高度
 * @param {int} size 识别精度
 * @param {int} limit 切片高度，超过这个值会进行分割，值小于0时不进行切片
 * @param {int} scope 容错值，解决因为压缩导致的颜色偏差
 * @return {unsigned char *} 结果数据指针
 */
unsigned char *analyse(unsigned char *startPtr, int width, int height, int size, int limit, int scope)
{
    // 图片数据长度
    int dataSize = width * height * 4;

    // 一行对应的数据长度
    int lineSize = width * 4;

    int s1 = size * lineSize;
    int s2 = size * 4;

    // 计算索引
    int w = getCeil(width, size);
    int h = getCeil(height, size);

    // 图像数据只依次遍历一次，因此可以将索引信息直接覆盖在上面
    unsigned char *memPtr = startPtr;

    // 计算纯色单元索引 getCeil(width, size) * getCeil(height, size) * 4
    for (int y = 0, p1 = 0, iy = 0; y < height; y += size, p1 += s1, iy++)
    {
        for (int x = 0, p2 = p1, ix = 0; x < width; x += size, p2 += s2, ix++)
        {
            int size_w = size > width - x ? width - x : size;
            int size_h = size > height - y ? height - y : size;

            // 统计方格内颜色值
            for (int i = 0, p3 = p2; i < size_h; i++, p3 += lineSize)
            {
                for (int j = 0, p4 = p3; j < size_w; j++, p4 += 4)
                {
                    unsigned char r = startPtr[p4];
                    unsigned char g = startPtr[p4 + 1];
                    unsigned char b = startPtr[p4 + 2];
                    if (memPtr[3] != BG_ITEM)
                    {
                        memPtr[0] = r;
                        memPtr[1] = g;
                        memPtr[2] = b;
                        memPtr[3] = BG_ITEM;
                    }
                    else if (
                        (getAbs(memPtr[0] - r) > scope) ||
                        (getAbs(memPtr[1] - g) > scope) ||
                        (getAbs(memPtr[2] - b) > scope))
                    { // 颜色不一致，跳出循环
                        memPtr[3] = ACT_ITEM;
                        i = size_h;
                        j = size_w;
                    }
                }
            }

            memPtr += 4;
        }
    }

    // 判断背景色
    int backgroundColorValue = getBgcolor(startPtr, memPtr - startPtr);
    unsigned char bgR = backgroundColorValue >> 16;
    unsigned char bgG = (backgroundColorValue >> 8) % 256;
    unsigned char bgB = backgroundColorValue % 256;

    // 计算索引
    memPtr = indexImg(startPtr, bgR, bgG, bgB, scope, w, h);

    // 分割图片
    int count = splitImg(startPtr, memPtr + 7, w, 0, 0, w - 1, h - 1, width, height, size, limit);

    // [0, 3) 背景色 R G B
    // [3, 7) 裁剪结果数量
    // [7, 7 + 24n) 裁剪结果列表 left top right bottom width height
    memPtr[0] = bgR;
    memPtr[1] = bgG;
    memPtr[2] = bgB;
    setIntValue(memPtr + 3, count);

    return memPtr;
}

}

#pragma endregion
